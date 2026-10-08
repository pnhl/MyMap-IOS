import ExpoModulesCore
import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

final class SystemAI {
  private var work: Task<Void, Never>?
  static func available() -> Bool {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      if case .available = SystemLanguageModel.default.availability { return true }
    }
    #endif
    return false
  }
  func run(_ action: String, input: String, promise: Promise) {
    if action == "status" { promise.resolve(["status": Self.available() ? "available" : "unavailable"]); return }
    guard action == "generate", Self.available() else {
      promise.reject("SYSTEM_AI_UNAVAILABLE", "Bật Apple Intelligence trên thiết bị hỗ trợ, hoặc chọn mô hình GGUF cục bộ."); return
    }
    guard work == nil else { promise.reject("SYSTEM_AI_BUSY", "AI đang xử lý."); return }
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      work = Task { @MainActor in
        defer { self.work = nil }
        do {
          let session = LanguageModelSession()
          let response = try await session.respond(to: String(input.prefix(4500)))
          try Task.checkCancellation()
          promise.resolve(String(response.content.prefix(10000)))
        } catch { promise.reject(error) }
      }
    }
    #else
    promise.reject("SYSTEM_AI_UNAVAILABLE", "Bản build này chưa có Foundation Models. Chọn GGUF cục bộ.")
    #endif
  }
  func stop() { work?.cancel() }
}
