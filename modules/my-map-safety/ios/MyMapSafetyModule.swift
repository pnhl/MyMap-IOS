import BackgroundTasks
import CoreLocation
import CoreMotion
import ExpoModulesCore
import Foundation
import Photos
import WatchConnectivity
import UIKit

private let incidentEvent = "onIncidentDetected"
private let visitEvent = "onVisitDetected"
private let regionEvent = "onRegionStateChanged"
private let watchSosEvent = "onWatchSosTriggered"

// Expo Module is not NSObject; Objective-C delegates must live on an NSObject.
private final class SafetyDelegate: NSObject, CLLocationManagerDelegate, WCSessionDelegate {
  weak var owner: MyMapSafetyModule?
  init(_ owner: MyMapSafetyModule) { self.owner = owner }
  func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) { owner?.locationManager(manager, didVisit: visit) }
  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) { owner?.locationManager(manager, didEnterRegion: region) }
  func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) { owner?.locationManager(manager, didExitRegion: region) }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { owner?.session(session, didReceiveMessage: message) }
}

public final class MyMapSafetyModule: Module {
  private lazy var delegate = SafetyDelegate(self)
  private let motionManager = CMMotionManager()
  private let altimeter = CMAltimeter()
  private let pedometer = CMPedometer()
  private let activityManager = CMMotionActivityManager()
  private var detectedActivity = "STILL"
  private var locationManager: CLLocationManager?

  private let motionQueue: OperationQueue = {
    let queue = OperationQueue()
    queue.name = "com.mymap.safety-motion"
    queue.maxConcurrentOperationCount = 1
    queue.qualityOfService = .userInitiated
    return queue
  }()

  private var crashThresholdG = 4.5
  private var fallThresholdG = 3.2
  private var cooldownSeconds = 30.0
  private var lastTriggerTime = -Double.infinity
  private var lastFreeFallTime = -Double.infinity
  private var relativeAltitudeDrop = 0.0
  private var isAltimeterRunning = false
  private func configuredLocationManager() -> CLLocationManager {
    if let manager = locationManager { return manager }
    let manager = CLLocationManager(); manager.delegate = delegate
    locationManager = manager; return manager
  }

  public func definition() -> ModuleDefinition {
    Name("MyMapSafety")

    Events(incidentEvent, visitEvent, regionEvent, watchSosEvent, "onActivityChanged")
    AsyncFunction("getDetectedActivity") { () -> String in
      guard CMMotionActivityManager.isActivityAvailable() else { return "UNKNOWN" }
      self.activityManager.startActivityUpdates(to: .main) { [weak self] activity in
        guard let self, let activity, activity.confidence != .low else { return }
        let value = activity.automotive ? "IN_VEHICLE" : activity.cycling ? "ON_BICYCLE" : activity.running ? "RUNNING" : activity.walking ? "WALKING" : "STILL"
        self.detectedActivity = value
        self.sendEvent("onActivityChanged", ["activity": value, "timestamp": Date().timeIntervalSince1970 * 1000])
      }
      return self.detectedActivity
    }.runOnQueue(.main)
    AsyncFunction("readGeoExif") { (uri: String) -> [String: Any] in try GeoMetadata.read(uri) }
    AsyncFunction("writeGeoExif") { (uri: String, lat: Double, lon: Double, altitude: Double?, timestamp: Double?) -> Bool in
      try GeoMetadata.write(uri, latitude: lat, longitude: lon, altitude: altitude, timestamp: timestamp)
    }

    AsyncFunction("isAvailable") {
      self.motionManager.isAccelerometerAvailable
    }

    AsyncFunction("getAvailableSensors") {
      [
        "accelerometer": self.motionManager.isAccelerometerAvailable,
        "gyroscope": self.motionManager.isGyroAvailable,
        "deviceMotion": self.motionManager.isDeviceMotionAvailable,
        "altimeter": CMAltimeter.isRelativeAltitudeAvailable(),
        "pedometer": CMPedometer.isStepCountingAvailable(),
        "watchSession": WCSession.isSupported()
      ]
    }

    // --- Multi-Sensor Fall & Crash Detection with Mattress/Drop Discrimination ---
    AsyncFunction("startDetection") {
      (crashThreshold: Double, fallThreshold: Double, cooldownMs: Double) -> Bool in
      guard self.motionManager.isAccelerometerAvailable else {
        return false
      }

      self.motionManager.stopAccelerometerUpdates()
      self.motionManager.stopDeviceMotionUpdates()
      if self.isAltimeterRunning {
        self.altimeter.stopRelativeAltitudeUpdates()
        self.isAltimeterRunning = false
      }

      self.crashThresholdG = max(1.0, crashThreshold)
      self.fallThresholdG = min(max(1.0, fallThreshold), self.crashThresholdG)
      self.cooldownSeconds = max(1.0, cooldownMs / 1_000.0)
      self.lastTriggerTime = -Double.infinity
      self.lastFreeFallTime = -Double.infinity
      self.relativeAltitudeDrop = 0.0

      // Start Altimeter if available to track vertical height drops
      if CMAltimeter.isRelativeAltitudeAvailable() {
        self.altimeter.startRelativeAltitudeUpdates(to: self.motionQueue) { [weak self] altData, error in
          guard error == nil, let self, let data = altData else { return }
          self.relativeAltitudeDrop = data.relativeAltitude.doubleValue
        }
        self.isAltimeterRunning = true
      }

      // Start Device Motion updates (Attitude + Gyro + User Acceleration)
      if self.motionManager.isDeviceMotionAvailable {
        self.motionManager.deviceMotionUpdateInterval = 0.04
        self.motionManager.startDeviceMotionUpdates(to: self.motionQueue) { [weak self] motion, error in
          guard error == nil, let self, let m = motion else { return }
          self.evaluateDeviceMotion(m)
        }
        return true
      } else {
        // Fallback to pure accelerometer
        self.motionManager.accelerometerUpdateInterval = 0.05
        self.motionManager.startAccelerometerUpdates(to: self.motionQueue) { [weak self] data, error in
          guard error == nil, let self, let acceleration = data?.acceleration else { return }
          self.evaluateAcceleration(acceleration)
        }
        return self.motionManager.isAccelerometerActive
      }
    }

    AsyncFunction("stopDetection") {
      self.stopAllSensors()
    }

    // --- CLVisit & Significant Location Changes (Tier C Background Location) ---
    AsyncFunction("startSignificantLocationMonitoring") { () -> Bool in
      let manager = self.configuredLocationManager()
      guard manager.authorizationStatus == .authorizedAlways,
            CLLocationManager.significantLocationChangeMonitoringAvailable() else { return false }
      manager.allowsBackgroundLocationUpdates = true
      manager.pausesLocationUpdatesAutomatically = false
      manager.startMonitoringSignificantLocationChanges()
      manager.startMonitoringVisits()
      return true
    }.runOnQueue(.main)

    AsyncFunction("stopSignificantLocationMonitoring") { () -> Bool in
      self.locationManager?.stopMonitoringSignificantLocationChanges()
      self.locationManager?.stopMonitoringVisits()
      return true
    }.runOnQueue(.main)

    // --- Geofence Region Monitoring (up to 20 regions) ---
    AsyncFunction("startMonitoringRegion") {
      (identifier: String, latitude: Double, longitude: Double, radiusMeters: Double) -> Bool in
      guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return false }
      let manager = self.configuredLocationManager()
      guard manager.authorizationStatus == .authorizedAlways, !identifier.isEmpty,
            CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: latitude, longitude: longitude)),
            radiusMeters.isFinite, radiusMeters > 0,
            manager.monitoredRegions.count < 20 || manager.monitoredRegions.contains(where: { $0.identifier == identifier }) else { return false }
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      let region = CLCircularRegion(center: center, radius: min(radiusMeters, manager.maximumRegionMonitoringDistance), identifier: identifier)
      region.notifyOnEntry = true; region.notifyOnExit = true
      manager.startMonitoring(for: region)
      return true
    }.runOnQueue(.main)

    // --- WatchConnectivity (Apple Watch SOS & Haptics) ---
    AsyncFunction("setupWatchConnectivity") { () -> Bool in
      guard WCSession.isSupported() else { return false }
      let session = WCSession.default
      session.delegate = self.delegate
      session.activate()
      return true
    }

    AsyncFunction("sendGeofenceHapticToWatch") { (regionName: String) -> Bool in
      guard WCSession.isSupported() && WCSession.default.isReachable else { return false }
      WCSession.default.sendMessage(["type": "geofence_vibrate", "region": regionName], replyHandler: nil)
      return true
    }

    // --- PhotoKit Native Album & EXIF ---
    AsyncFunction("savePhotoToNativeAlbum") { (sourceUriString: String, albumName: String, promise: Promise) in
      let fileUrl: URL
      do { fileUrl = try GeoMetadata.url(sourceUriString) }
      catch { promise.reject(error); return }
      guard FileManager.default.fileExists(atPath: fileUrl.path), !albumName.isEmpty, albumName.count <= 100 else { promise.resolve(false); return }
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
        guard status == .authorized || status == .limited else { promise.resolve(false); return }
        PHPhotoLibrary.shared().performChanges({
          let request = PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: fileUrl)
          let options = PHFetchOptions()
          options.predicate = NSPredicate(format: "title = %@", albumName)
          let collection = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: options)
          let albumChangeRequest: PHAssetCollectionChangeRequest?
          if let album = collection.firstObject { albumChangeRequest = PHAssetCollectionChangeRequest(for: album) }
          else { albumChangeRequest = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: albumName) }
          if let placeholder = request?.placeholderForCreatedAsset {
            albumChangeRequest?.addAssets([placeholder] as NSArray)
          }
        }) { success, error in
          if let error { promise.reject(error) } else { promise.resolve(success) }
        }
      }
    }

    // --- Background Tasks Registration Hook ---
    AsyncFunction("registerBackgroundTasks") { () -> Bool in
      return false
    }

    // --- Hardware Battery Status ---
    AsyncFunction("getBatteryStatus") { () -> [String: Any] in
      UIDevice.current.isBatteryMonitoringEnabled = true
      let rawLevel = UIDevice.current.batteryLevel
      let level = rawLevel >= 0 ? Int(rawLevel * 100) : -1
      let isCharging = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
      return ["level": level, "isCharging": isCharging]
    }

    OnDestroy {
      self.stopAllSensors()
      self.activityManager.stopActivityUpdates()
      DispatchQueue.main.async {
        self.locationManager?.stopMonitoringSignificantLocationChanges()
        self.locationManager?.stopMonitoringVisits()
        for region in self.locationManager?.monitoredRegions ?? [] { self.locationManager?.stopMonitoring(for: region) }
      }
      self.motionQueue.cancelAllOperations()
    }
  }

  private func evaluateDeviceMotion(_ m: CMDeviceMotion) {
    let acc = m.userAcceleration
    let rot = m.rotationRate
    let peakG = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z)
    let rotSpeed = sqrt(rot.x * rot.x + rot.y * rot.y + rot.z * rot.z)
    let now = ProcessInfo.processInfo.systemUptime

    if peakG < 0.4 {
      lastFreeFallTime = now
    }

    if peakG >= fallThresholdG {
      let hadFreeFall = (now - lastFreeFallTime) < 0.8
      let hadRotation = rotSpeed > 2.0
      let isTrueFall = (peakG >= crashThresholdG) || hadFreeFall || hadRotation

      if isTrueFall {
        guard now - lastTriggerTime >= cooldownSeconds else { return }
        lastTriggerTime = now

        let type = peakG >= crashThresholdG ? "possible_crash" : "possible_fall"
        sendEvent(incidentEvent, [
          "type": type,
          "peakG": peakG,
          "rotSpeed": rotSpeed,
          "hadFreeFall": hadFreeFall,
          "relativeAltitudeDrop": relativeAltitudeDrop,
          "timestamp": Date().timeIntervalSince1970 * 1_000,
          "platform": "ios"
        ])
      }
    }
  }

  private func evaluateAcceleration(_ acceleration: CMAcceleration) {
    let peakG = sqrt(
      acceleration.x * acceleration.x +
      acceleration.y * acceleration.y +
      acceleration.z * acceleration.z
    )

    let type: String
    if peakG >= crashThresholdG {
      type = "possible_crash"
    } else if peakG >= fallThresholdG {
      type = "possible_fall"
    } else {
      return
    }

    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastTriggerTime >= cooldownSeconds else { return }
    lastTriggerTime = now

    sendEvent(incidentEvent, [
      "type": type,
      "peakG": peakG,
      "timestamp": Date().timeIntervalSince1970 * 1_000,
      "platform": "ios"
    ])
  }

  private func stopAllSensors() {
    motionManager.stopAccelerometerUpdates()
    motionManager.stopDeviceMotionUpdates()
    if isAltimeterRunning {
      altimeter.stopRelativeAltitudeUpdates()
      isAltimeterRunning = false
    }
  }

  // --- CLLocationManagerDelegate ---
  public func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
    let departureTime = visit.departureDate == Date.distantFuture ? nil : visit.departureDate.timeIntervalSince1970 * 1000
    sendEvent(visitEvent, [
      "latitude": visit.coordinate.latitude,
      "longitude": visit.coordinate.longitude,
      "accuracy": visit.horizontalAccuracy,
      "arrivalDate": visit.arrivalDate.timeIntervalSince1970 * 1000,
      "departureDate": departureTime as Any
    ])
  }

  public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    sendEvent(regionEvent, ["state": "entered", "identifier": region.identifier])
  }

  public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
    sendEvent(regionEvent, ["state": "exited", "identifier": region.identifier])
  }

  // --- WCSessionDelegate ---
  public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  public func sessionDidBecomeInactive(_ session: WCSession) {}
  public func sessionDidDeactivate(_ session: WCSession) {}

  public func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
    if let action = message["action"] as? String, action == "trigger_sos" {
      sendEvent(watchSosEvent, ["source": "apple_watch", "timestamp": Date().timeIntervalSince1970 * 1000])
    }
  }
}
