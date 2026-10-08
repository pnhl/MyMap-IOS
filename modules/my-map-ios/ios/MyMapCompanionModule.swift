import ExpoModulesCore
import UIKit
import WatchConnectivity
import UserNotifications
import CoreLocation

final class MyMapCompanionStore: NSObject, WCSessionDelegate, CLLocationManagerDelegate {
  static let shared = MyMapCompanionStore()
  var onSOS: (() -> Void)?
  var onStop: (() -> Void)?
  var state: [String: Any] = [:]
  var watchEnabled = false
  var carEnabled = false
  var carConnected = false { didSet { reconcileLocation() } }
  private let location = CLLocationManager()
  private var nextStep = 0
  private var routeVersion: Double = -1
  private var phoneForeground: Bool {
    UIApplication.shared.connectedScenes.contains { $0.session.role == .windowApplication && $0.activationState == .foregroundActive }
  }
  override init() { super.init(); location.delegate = self }
  private func reconcileLocation() {
    guard carConnected, carEnabled, state["active"] as? Bool == true,
      location.authorizationStatus == .authorizedAlways || location.authorizationStatus == .authorizedWhenInUse else {
      location.stopUpdatingLocation(); return
    }
    location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
    location.distanceFilter = 5; location.allowsBackgroundLocationUpdates = true
    location.showsBackgroundLocationIndicator = true; location.startUpdatingLocation()
  }
  func configure(watch: Bool, car: Bool) {
    watchEnabled = watch; carEnabled = car
    if WCSession.isSupported() {
      let session = WCSession.default
      session.delegate = self
      if session.activationState == .activated { publishWatch() } else if watch { session.activate() }
    }
    if !car && !watch { state = [:] }
    reconcileLocation()
    NotificationCenter.default.post(name: .myMapNavigationChanged, object: nil)
  }
  func stopNavigation() {
    state = ["active":false,"coordinates":[],"updatedAt":Date().timeIntervalSince1970*1000]
    reconcileLocation(); publishWatch()
    NotificationCenter.default.post(name:.myMapNavigationChanged,object:nil)
    onStop?()
  }
  func update(_ json: String) throws {
    guard watchEnabled || carEnabled else { state = [:]; return }
    guard json.utf8.count < 512000, let data = json.data(using: .utf8),
      let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
    state = value
    if let version = value["routeVersion"] as? Double, version != routeVersion {
      routeVersion = version
      let steps = value["steps"] as? [[String: Any]] ?? []
      let current = (value["guidance"] as? [String: Any])?["instruction"] as? String
      nextStep = steps.firstIndex { $0["instruction"] as? String == current } ?? 0
    }
    reconcileLocation()
    publishWatch()
    NotificationCenter.default.post(name: .myMapNavigationChanged, object: nil)
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard carEnabled, carConnected, state["active"] as? Bool == true, let fix = locations.last,
      fix.horizontalAccuracy >= 0, fix.horizontalAccuracy < 100, abs(fix.timestamp.timeIntervalSinceNow) < 15 else { return }
    state["position"] = ["latitude":fix.coordinate.latitude,"longitude":fix.coordinate.longitude]
    state["speed"] = max(0, fix.speed*3.6); state["updatedAt"] = Date().timeIntervalSince1970*1000
    if !phoneForeground, let steps = state["steps"] as? [[String: Any]], !steps.isEmpty {
      func distance(_ step: [String: Any]) -> Double? {
        guard let point = step["position"] as? [Double], point.count >= 2 else { return nil }
        return fix.distance(from:CLLocation(latitude:point[0],longitude:point[1]))
      }
      while nextStep < steps.count-1, let d = distance(steps[nextStep]), d < 25 { nextStep += 1 }
      if nextStep < steps.count, let d = distance(steps[nextStep]) {
        var guidance = steps[nextStep]; guidance["distanceMeters"] = d
        state["guidance"] = guidance
      }
    }
    publishWatch(); NotificationCenter.default.post(name:.myMapNavigationChanged,object:nil)
  }
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { reconcileLocation() }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { location.stopUpdatingLocation() }
  private func publishWatch() {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
    let guidance = state["guidance"] as? [String: Any] ?? [:]
    let meters = max(0, guidance["distanceMeters"] as? Double ?? 0)
    let speed = max(0, state["speed"] as? Double ?? 0)
    let context: [String: Any] = ["enabled":watchEnabled,"instruction":watchEnabled ? String((guidance["instruction"] as? String ?? "Chưa có tuyến đường").prefix(160)) : "",
      "distance":watchEnabled ? (meters >= 1000 ? String(format:"%.1f km",meters/1000) : "\(Int(meters)) m") : "",
      "speed":watchEnabled ? "\(Int(speed.rounded())) km/h" : "","updatedAt":Date().timeIntervalSince1970*1000]
    try? WCSession.default.updateApplicationContext(context)
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { self.publishWatch() }
  }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async {
      guard self.watchEnabled, message["action"] as? String == "trigger_sos" else { replyHandler(["accepted":false]); return }
      if self.phoneForeground { self.onSOS?(); replyHandler(["accepted":true]) }
      else {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
          guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            replyHandler(["accepted":false,"message":"Mở MyMap trên iPhone. Quyền thông báo chưa bật."]); return
          }
          let content = UNMutableNotificationContent()
          content.title = "Yêu cầu SOS từ Apple Watch"; content.body = "Mở MyMap để xác nhận và chọn cách trợ giúp."
          content.sound = .default; content.userInfo = ["url":"mymap://sos"]
          UNUserNotificationCenter.current().add(UNNotificationRequest(identifier:"mymap-watch-sos",content:content,trigger:nil)) { error in
            replyHandler(["accepted":error == nil,"message":error == nil ? "Xác nhận SOS trên iPhone":"Chưa gửi được. Mở MyMap trên iPhone."])
          }
        }
      }
    }
  }
}
extension Notification.Name { static let myMapNavigationChanged = Notification.Name("MyMapNavigationChanged") }

public final class MyMapCompanionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyMapCompanion")
    Events("onWatchSOS", "onCarStop")
    OnCreate {
      MyMapCompanionStore.shared.onSOS = { [weak self] in self?.sendEvent("onWatchSOS", [:]) }
      MyMapCompanionStore.shared.onStop = { [weak self] in self?.sendEvent("onCarStop", [:]) }
    }
    AsyncFunction("configure") { (watch: Bool, car: Bool) in MyMapCompanionStore.shared.configure(watch:watch,car:car) }.runOnQueue(.main)
    AsyncFunction("updateNavigation") { (json: String) in try MyMapCompanionStore.shared.update(json) }.runOnQueue(.main)
    AsyncFunction("status") { () -> [String: Any] in
      let session = WCSession.default
      return ["watchSupported":WCSession.isSupported(),"paired":session.isPaired,"installed":session.isWatchAppInstalled,
        "reachable":session.isReachable,"carPlayConfigured":Bundle.main.object(forInfoDictionaryKey:"UIApplicationSceneManifest") != nil]
    }.runOnQueue(.main)
    AsyncFunction("geofenceHaptic") { (name: String) -> Bool in
      guard MyMapCompanionStore.shared.watchEnabled, WCSession.isSupported(), WCSession.default.isReachable else { return false }
      WCSession.default.sendMessage(["type":"geofence_vibrate","region":String(name.prefix(100))],replyHandler:nil)
      return true
    }.runOnQueue(.main)
    OnDestroy {
      DispatchQueue.main.async {
        MyMapCompanionStore.shared.configure(watch:false,car:false)
        MyMapCompanionStore.shared.onSOS = nil; MyMapCompanionStore.shared.onStop = nil
      }
    }
  }
}
