import AudioToolbox
import CoreMotion
import ExpoModulesCore
import UIKit

// iOS has no Android foreground-service or automatic emergency-call equivalent.
// Motion monitoring is foreground-only; location recording uses expo-location.
public final class MyMapTravelModule: Module {
  private let motion = CMMotionManager()
  private var enabled = false
  private var pendingAt: Double = 0
  private var lastIncident: Double = 0
  private var number = "112"
  private var foreground = true
  private func monitor() {
    motion.stopDeviceMotionUpdates()
    guard enabled, foreground, motion.isDeviceMotionAvailable else { return }
    motion.deviceMotionUpdateInterval = 0.05
    motion.startDeviceMotionUpdates(to: .main) { [weak self] data, error in
      guard let self, let data, error == nil else { return }
      let a = data.userAcceleration
      let magnitude = sqrt(a.x*a.x + a.y*a.y + a.z*a.z)
      let now = Date().timeIntervalSince1970 * 1000
      if magnitude >= 4.5, now - self.lastIncident > 30000 {
        self.lastIncident = now; self.pendingAt = now
        AudioServicesPlayAlertSound(SystemSoundID(1005))
      }
    }
  }
  public func definition() -> ModuleDefinition {
    Name("MyMapTravel")
    AsyncFunction("configureSafety") { (value: Bool, number: String) -> Bool in
      guard !value || self.motion.isDeviceMotionAvailable else { return false }
      self.enabled = value; self.number = number; self.pendingAt = 0
      UserDefaults.standard.set(value, forKey: "mymap.ios.safety.enabled")
      UserDefaults.standard.set(number, forKey: "mymap.ios.safety.number")
      self.monitor(); return true
    }.runOnQueue(.main)
    AsyncFunction("safetyState") { () -> [String: Any] in
      ["enabled": self.enabled, "pendingAt": self.pendingAt, "deadline": 0,
       "heightMeters": 0, "kind": "possible_crash", "emergencyNumber": self.number]
    }.runOnQueue(.main)
    AsyncFunction("setForeground") { (value: Bool) in
      self.foreground = value; self.pendingAt = 0; self.monitor()
    }.runOnQueue(.main)
    AsyncFunction("userInteraction") { self.pendingAt = 0 }.runOnQueue(.main)
    AsyncFunction("dismissIncident") { self.pendingAt = 0 }.runOnQueue(.main)
    AsyncFunction("playWarning") { AudioServicesPlayAlertSound(SystemSoundID(1005)) }.runOnQueue(.main)
    AsyncFunction("openDialer") { (value: String, promise: Promise) in
      guard !value.isEmpty, value.count <= 24, value.allSatisfy({ $0.isNumber || $0 == "+" }),
            let url = URL(string: "tel:" + value) else {
        promise.reject("INVALID_NUMBER", "Số điện thoại không hợp lệ."); return
      }
      UIApplication.shared.open(url) { promise.resolve($0) }
    }.runOnQueue(.main)
    AsyncFunction("getBuildInfo") { ["channel": "ios", "appstoreId": ""] }
    OnCreate {
      self.enabled = UserDefaults.standard.bool(forKey: "mymap.ios.safety.enabled")
      self.number = UserDefaults.standard.string(forKey: "mymap.ios.safety.number") ?? "112"
    }
    OnDestroy { self.motion.stopDeviceMotionUpdates() }
  }
}
