import AVFoundation
import CryptoKit
import ExpoModulesCore
import LocalAuthentication
import Security
import UIKit
import os

private final class SpeechSessionDelegate: NSObject, AVSpeechSynthesizerDelegate {
  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    if !synthesizer.isSpeaking { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
  }
}

public final class MyMapCapabilitiesModule: Module {
  private let speech = AVSpeechSynthesizer()
  private let speechDelegate = SpeechSessionDelegate()
  private let keyLock = NSLock()
  private let recognition = OfflineSpeech()
  private let systemAI = SystemAI()
  private var cover:UIView?
  private var privateScreen=false
  private var observers:[NSObjectProtocol]=[]
  private func coverPreview() {
    guard privateScreen,cover==nil,let window=UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where:{ $0.isKeyWindow }) else { return }
    let shield=UIView(frame:window.bounds);shield.backgroundColor=UIColor(red:0.06,green:0.09,blue:0.15,alpha:1);shield.autoresizingMask=[.flexibleWidth,.flexibleHeight];window.addSubview(shield);cover=shield
  }
  private func refreshCover() {
    if privateScreen && (UIScreen.main.isCaptured || UIApplication.shared.applicationState != .active) { coverPreview() }
    else { cover?.removeFromSuperview();cover=nil }
  }
  private func key(_ account: String, create: () throws -> Data) throws -> Data {
    keyLock.lock(); defer { keyLock.unlock() }
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "com.mymap.capabilities", kSecAttrAccount as String: account,
      kSecReturnData as String: true]
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &value)
    if status == errSecSuccess, let bytes = value as? Data { return bytes }
    guard status == errSecItemNotFound else { throw NSError(domain: "MyMapKeychain", code: Int(status)) }
    let data = try create()
    var item = query; item.removeValue(forKey: kSecReturnData as String)
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let saved = SecItemAdd(item as CFDictionary, nil)
    guard saved == errSecSuccess else { throw NSError(domain: "MyMapKeychain", code: Int(saved)) }
    return data
  }
  private func vaultKey() throws -> SymmetricKey {
    SymmetricKey(data: try key("vault.v1") { SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) } })
  }
  public func definition() -> ModuleDefinition {
    Name("MyMapCapabilities")
    AsyncFunction("aiHardware") { () -> [String: Any] in
      ["local64Bit": MemoryLayout<Int>.size == 8,
       "availableBytes": Double(os_proc_available_memory()),
       "totalBytes": Double(ProcessInfo.processInfo.physicalMemory),
       "systemSupported": SystemAI.available()]
    }
    AsyncFunction("hashAiModel") { (uri: String) -> String in
      guard let url = URL(string: uri), url.isFileURL else { throw NSError(domain: "MyMapModel", code: 1) }
      let file = url.resolvingSymlinksInPath().standardizedFileURL
      let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .resolvingSymlinksInPath().appendingPathComponent("mymap/ai").standardizedFileURL
      guard file.path.hasPrefix(documents.path + "/"), file.pathExtension == "gguf" else { throw NSError(domain: "MyMapModel", code: 2) }
      let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
      var hash = SHA256()
      while let bytes = try handle.read(upToCount: 1024 * 1024), !bytes.isEmpty { hash.update(data: bytes) }
      return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }.runOnQueue(DispatchQueue.global(qos: .userInitiated))
    AsyncFunction("systemAi") { (action: String, input: String, promise: Promise) in
      self.systemAI.run(action, input: input, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("stopAi") { self.systemAI.stop() }.runOnQueue(.main)
    AsyncFunction("speechInputAvailable") { OfflineSpeech.available() }.runOnQueue(.main)
    AsyncFunction("recognizeSpeech") { (language: String, promise: Promise) in
      self.recognition.start(language, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("stopRecognition") { self.recognition.stop() }.runOnQueue(.main)
    AsyncFunction("setPrivateScreen") { (enabled:Bool) in
      self.privateScreen=enabled
      if !enabled { self.cover?.removeFromSuperview();self.cover=nil }
      if self.observers.isEmpty {
        self.observers.append(NotificationCenter.default.addObserver(forName:UIApplication.willResignActiveNotification,object:nil,queue:.main){ [weak self] _ in self?.coverPreview() })
        self.observers.append(NotificationCenter.default.addObserver(forName:UIApplication.didBecomeActiveNotification,object:nil,queue:.main){ [weak self] _ in self?.refreshCover() })
        self.observers.append(NotificationCenter.default.addObserver(forName:UIScreen.capturedDidChangeNotification,object:nil,queue:.main){ [weak self] _ in self?.refreshCover() })
      }
      self.refreshCover()
    }.runOnQueue(.main)
    AsyncFunction("analyzePhoto") { (uri:String) -> [String:Any] in try PhotoAnalyzer.analyze(uri) }.runOnQueue(DispatchQueue.global(qos: .userInitiated))
    AsyncFunction("authenticate") { (reason: String, promise: Promise) in
      let context = LAContext(); var error: NSError?
      guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else { promise.resolve(false); return }
      context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, _ in promise.resolve(success) }
    }
    AsyncFunction("encrypt") { (value: String) -> String in
      let box = try AES.GCM.seal(Data(value.utf8), using: self.vaultKey())
      guard let data = box.combined else { throw NSError(domain: "MyMapVault", code: 1) }
      return data.base64EncodedString()
    }
    AsyncFunction("decrypt") { (value: String) -> String in
      guard let data = Data(base64Encoded: value) else { throw NSError(domain: "MyMapVault", code: 2) }
      let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: self.vaultKey())
      guard let text = String(data: plain, encoding: .utf8) else { throw NSError(domain: "MyMapVault", code: 3) }
      return text
    }
    AsyncFunction("sign") { (value: String) -> [String: String] in
      let bytes = try self.key("proof.v1") { P256.Signing.PrivateKey().rawRepresentation }
      let signingKey = try P256.Signing.PrivateKey(rawRepresentation: bytes)
      let signature = try signingKey.signature(for: Data(value.utf8))
      return ["signature": signature.derRepresentation.base64EncodedString(),
        "publicKey": signingKey.publicKey.derRepresentation.base64EncodedString(), "algorithm": "ECDSA-P256-SHA256-SPKI-DER"]
    }
    AsyncFunction("speak") { (text: String, language: String) -> Bool in
      guard let voice = AVSpeechSynthesisVoice(language: language) else { return false }
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: .duckOthers)
      try AVAudioSession.sharedInstance().setActive(true)
      self.speech.delegate = self.speechDelegate
      self.speech.stopSpeaking(at: .immediate)
      let utterance = AVSpeechUtterance(string: String(text.prefix(1000))); utterance.voice = voice
      self.speech.speak(utterance); return true
    }.runOnQueue(.main)
    AsyncFunction("stopSpeaking") { self.speech.stopSpeaking(at: .immediate); try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }.runOnQueue(.main)
    OnDestroy { DispatchQueue.main.async { self.recognition.stop();self.systemAI.stop();self.speech.stopSpeaking(at: .immediate);self.observers.forEach { NotificationCenter.default.removeObserver($0) };self.observers=[];self.cover?.removeFromSuperview();self.cover=nil } }
  }
}
