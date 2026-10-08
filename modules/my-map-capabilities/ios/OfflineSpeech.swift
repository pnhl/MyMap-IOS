import AVFoundation
import ExpoModulesCore
import Speech

final class OfflineSpeech {
  private let engine = AVAudioEngine()
  private var task: SFSpeechRecognitionTask?
  private var promise: Promise?
  private var timeout: DispatchWorkItem?
  private var tapInstalled = false
  private var generation = 0

  static func available(_ language: String = "vi-VN") -> Bool {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else { return false }
    return recognizer.isAvailable && recognizer.supportsOnDeviceRecognition
  }

  func start(_ language: String, promise: Promise) {
    guard self.promise == nil else { promise.reject("SPEECH_BUSY", "Đang nhận dạng giọng nói."); return }
    self.promise = promise; generation += 1
    let token = generation
    SFSpeechRecognizer.requestAuthorization { status in
      AVAudioSession.sharedInstance().requestRecordPermission { microphone in
        DispatchQueue.main.async {
          guard token == self.generation, self.promise != nil else { return }
          guard status == .authorized && microphone else {
            self.finish(nil, "Cần quyền micro và nhận dạng giọng nói trong Cài đặt."); return
          }
          do { try self.record(language, token: token) }
          catch { self.finish(nil, error.localizedDescription) }
        }
      }
    }
  }

  private func record(_ language: String, token: Int) throws {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)),
      recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
      finish(nil, "Thiết bị chưa hỗ trợ nhận dạng ngoại tuyến cho ngôn ngữ này."); return
    }
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
    try session.setActive(true, options: .notifyOthersOnDeactivation)
    let input = engine.inputNode, format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else {
      finish(nil, "Micro chưa sẵn sàng."); return
    }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
    tapInstalled = true
    task = recognizer.recognitionTask(with: request) { result, error in
      DispatchQueue.main.async {
        guard token == self.generation else { return }
        if let result, result.isFinal { self.finish(result.bestTranscription.formattedString, nil) }
        else if let error { self.finish(nil, error.localizedDescription) }
      }
    }
    engine.prepare(); try engine.start()
    let timer = DispatchWorkItem { [weak self] in self?.finish(nil, "Đã hết thời gian nhận dạng.") }
    timeout = timer; DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timer)
  }

  private func finish(_ text: String?, _ error: String?) {
    generation += 1
    let pending = promise; promise = nil
    timeout?.cancel(); timeout = nil
    engine.stop()
    if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
    task?.cancel(); task = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    if let text { pending?.resolve(["text": text, "offline": true] as [String: Any]) }
    else if let pending { pending.reject("SPEECH_CANCELLED", error ?? "Đã dừng nhận dạng.") }
  }
  func stop() { finish(nil, "Đã dừng nhận dạng.") }
}
