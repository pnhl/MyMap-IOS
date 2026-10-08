import SwiftUI
import WatchConnectivity
import WatchKit

final class CompanionSession: NSObject, ObservableObject, WCSessionDelegate {
  @Published var instruction = "Bật Apple Watch trong MyMap trên iPhone"
  @Published var distance = ""
  @Published var speed = ""
  @Published var notice = ""
  @Published var reachable = false
  @Published var updatedAt: Date?
  override init() {
    super.init()
    if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { self.reachable = session.isReachable; self.apply(session.receivedApplicationContext) }
  }
  func sessionReachabilityDidChange(_ session: WCSession) { DispatchQueue.main.async { self.reachable = session.isReachable } }
  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) { DispatchQueue.main.async { self.apply(context) } }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async {
      if message["type"] as? String == "geofence_vibrate" {
        self.notice = String((message["region"] as? String ?? "Khu vực") .prefix(100))
        WKInterfaceDevice.current().play(.notification)
      } else { self.apply(message) }
    }
  }
  private func apply(_ context: [String: Any]) {
    guard context["enabled"] as? Bool == true else {
      instruction = "Đồng bộ đã tắt trên iPhone"; distance = ""; speed = ""; updatedAt = nil; return
    }
    guard let timestamp = context["updatedAt"] as? Double, Date().timeIntervalSince1970 * 1000 - timestamp < 60000 else {
      instruction = "Mở MyMap để cập nhật"; distance = ""; speed = ""; updatedAt = nil; return
    }
    updatedAt = Date(timeIntervalSince1970: timestamp / 1000)
    instruction = context["instruction"] as? String ?? "Chưa có tuyến đường"
    distance = context["distance"] as? String ?? ""
    speed = context["speed"] as? String ?? ""
  }
  func requestSOS() {
    guard WCSession.default.isReachable else { notice = "Mở MyMap trên iPhone rồi thử lại"; return }
    WCSession.default.sendMessage(["action":"trigger_sos"], replyHandler: { reply in
      DispatchQueue.main.async { self.notice = reply["message"] as? String ?? (reply["accepted"] as? Bool == true ? "Xác nhận SOS trên iPhone" : "Bật Apple Watch trong MyMap") }
    }, errorHandler: { _ in DispatchQueue.main.async { self.notice = "Chưa gửi được. Thử lại trên iPhone" } })
  }
}

@main struct MyMapWatchApp: App {
  @StateObject private var session = CompanionSession()
  @State private var confirmingSOS = false
  var body: some Scene {
    WindowGroup {
      ScrollView {
        VStack(spacing: 12) {
          Label("MyMap", systemImage: "map.fill").foregroundStyle(.cyan)
          TimelineView(.periodic(from: .now, by: 5)) { context in
            let fresh = session.updatedAt.map { context.date.timeIntervalSince($0) < 60 } ?? false
            Text(fresh ? session.instruction : "Mở MyMap để cập nhật").font(.headline)
            if fresh { Text(session.distance).font(.title2); Text(session.speed).foregroundStyle(.secondary) }
          }
          Text(session.reachable ? "Đã nối iPhone" : "iPhone chưa sẵn sàng").font(.caption)
          Button("Yêu cầu SOS", role: .destructive) { confirmingSOS = true }
            .confirmationDialog("Gửi yêu cầu SOS đến iPhone?", isPresented: $confirmingSOS) {
              Button("Gửi yêu cầu", role: .destructive) { session.requestSOS() }
            } message: { Text("Bạn vẫn cần xác nhận trên iPhone. MyMap không tự gọi khẩn cấp.") }
          if !session.notice.isEmpty { Text(session.notice).font(.caption) }
        }.padding()
      }
    }
  }
}
