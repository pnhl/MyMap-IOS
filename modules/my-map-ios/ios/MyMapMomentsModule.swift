import AVFoundation
import ExpoModulesCore
import UIKit

private struct RecapRequest: Decodable {
  struct Item: Decodable { let uri: String; let kind: String; let durationMs: Double; let label: String }
  let account: String
  let items: [Item]
}

public final class MyMapMomentsModule: Module {
  private let exportQueue = DispatchQueue(label: "com.mymap.recap", qos: .userInitiated)
  private let lock = NSLock()
  private var busy = false
  private var cancelled = false
  private func checkCancellation() throws {
    lock.lock(); let stopped = cancelled; lock.unlock()
    if stopped { throw NSError(domain: "MyMapRecap", code: 1, userInfo: [NSLocalizedDescriptionKey: "Đã hủy xuất video."]) }
  }
  private func privateURL(_ value: String) throws -> URL {
    guard let url = URL(string: value), url.isFileURL else { throw NSError(domain: "MyMapFile", code: 1) }
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL
    let roots = [FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0],
                 FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0],
                 URL(fileURLWithPath: NSTemporaryDirectory())]
    guard roots.contains(where: { resolved.path.hasPrefix($0.resolvingSymlinksInPath().standardizedFileURL.path + "/") }),
          FileManager.default.fileExists(atPath: resolved.path) else { throw NSError(domain: "MyMapFile", code: 2) }
    return resolved
  }

  public func definition() -> ModuleDefinition {
    Name("MyMapMoments")
    AsyncFunction("exportRecap") { (json: String, promise: Promise) in
      self.lock.lock()
      if self.busy { self.lock.unlock(); promise.reject("EXPORT_BUSY", "Đang xuất một video khác."); return }
      self.busy = true; self.cancelled = false; self.lock.unlock()
      self.exportQueue.async {
        defer { self.lock.lock(); self.busy = false; self.lock.unlock() }
        do { promise.resolve(try self.export(json).absoluteString) }
        catch { promise.reject(error) }
      }
    }
    AsyncFunction("cancelRecap") { () -> Bool in
      self.lock.lock(); self.cancelled = true; self.lock.unlock(); return true
    }
    AsyncFunction("shareFile") { (uri: String, promise: Promise) in
      do {
        let url = try self.privateURL(uri)
        guard let presenter = self.appContext?.utilities?.currentViewController() else {
          promise.reject("SHARE_UI", "Chưa thể mở bảng chia sẻ."); return
        }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = presenter.view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
        sheet.completionWithItemsHandler = { _, completed, _, error in
          if let error { promise.reject(error) } else { promise.resolve(completed) }
        }
        presenter.present(sheet, animated: true)
      } catch { promise.reject(error) }
    }.runOnQueue(.main)
    OnDestroy { self.lock.lock(); self.cancelled = true; self.lock.unlock() }
  }

  private func export(_ json: String) throws -> URL {
    let request = try JSONDecoder().decode(RecapRequest.self, from: Data(json.utf8))
    guard request.account.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil,
          (1...20).contains(request.items.count) else { throw NSError(domain: "MyMapRecap", code: 2) }
    let inputs = try request.items.map { try privateURL($0.uri) }
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("mymap-recaps").appendingPathComponent(request.account)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let output = directory.appendingPathComponent("MyMap-recap-\(Int64(Date().timeIntervalSince1970 * 1000)).mp4")
    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    var success = false
    defer { if !success { writer.cancelWriting(); try? FileManager.default.removeItem(at: output) } }
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 720, AVVideoHeightKey: 1280])
    let adapter = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 720, kCVPixelBufferHeightKey as String: 1280, kCVPixelBufferCGImageCompatibilityKey as String: true, kCVPixelBufferCGBitmapContextCompatibilityKey as String: true])
    guard writer.canAdd(input) else { throw NSError(domain: "MyMapRecap", code: 3) }
    writer.add(input)
    guard writer.startWriting() else { throw writer.error ?? NSError(domain: "MyMapRecap", code: 4) }
    writer.startSession(atSourceTime: .zero)
    let deadline = Date().addingTimeInterval(600)
    var frame: Int64 = 0
    for (index, item) in request.items.enumerated() {
      guard ["photo", "video"].contains(item.kind), item.durationMs.isFinite else { throw NSError(domain: "MyMapRecap", code: 5) }
      let photo = item.kind == "photo" ? UIImage(contentsOfFile: inputs[index].path) : nil
      let generator = item.kind == "video" ? AVAssetImageGenerator(asset: AVURLAsset(url: inputs[index])) : nil
      generator?.appliesPreferredTrackTransform = true
      generator?.maximumSize = CGSize(width: 1280, height: 1280)
      let frames = max(1, Int(min(10000, max(100, item.durationMs)) / 1000 * 24))
      for localFrame in 0..<frames {
        try checkCancellation()
        guard Date() < deadline else { throw NSError(domain: "MyMapRecap", code: 6) }
        while !input.isReadyForMoreMediaData {
          try checkCancellation()
          guard writer.status == .writing, Date() < deadline else { throw writer.error ?? NSError(domain: "MyMapRecap", code: 7) }
          Thread.sleep(forTimeInterval: 0.01)
        }
        try autoreleasepool {
          let image: UIImage
          if let photo { image = photo }
          else if let generator { image = UIImage(cgImage: try generator.copyCGImage(at: CMTime(value: Int64(localFrame), timescale: 24), actualTime: nil)) }
          else { throw NSError(domain: "MyMapRecap", code: 8) }
          let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
          let rendered = UIGraphicsImageRenderer(size: CGSize(width: 720, height: 1280), format: format).image { context in
            UIColor.black.setFill(); context.fill(CGRect(x: 0, y: 0, width: 720, height: 1280))
            let ratio = min(720 / image.size.width, 1280 / image.size.height)
            let size = CGSize(width: image.size.width * ratio, height: image.size.height * ratio)
            image.draw(in: CGRect(x: (720-size.width)/2, y: (1280-size.height)/2, width: size.width, height: size.height))
            let shadow = NSShadow(); shadow.shadowColor = UIColor.black; shadow.shadowBlurRadius = 4
            (String(item.label.prefix(80)) as NSString).draw(in: CGRect(x: 32, y: 1160, width: 656, height: 88), withAttributes: [.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 26, weight: .semibold), .shadow: shadow])
          }
          guard let pool = adapter.pixelBufferPool else { throw NSError(domain: "MyMapRecap", code: 9) }
          var buffer: CVPixelBuffer?
          guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess, let buffer else { throw NSError(domain: "MyMapRecap", code: 10) }
          CVPixelBufferLockBaseAddress(buffer, [])
          defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
          guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: 720, height: 1280, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue), let cg = rendered.cgImage else { throw NSError(domain: "MyMapRecap", code: 11) }
          context.draw(cg, in: CGRect(x: 0, y: 0, width: 720, height: 1280))
          guard adapter.append(buffer, withPresentationTime: CMTime(value: frame, timescale: 24)) else { throw writer.error ?? NSError(domain: "MyMapRecap", code: 12) }
        }
        frame += 1
      }
    }
    input.markAsFinished()
    let finished = DispatchSemaphore(value: 0)
    writer.finishWriting { finished.signal() }
    while finished.wait(timeout: .now() + 0.1) == .timedOut { try checkCancellation(); if Date() >= deadline { throw NSError(domain: "MyMapRecap", code: 13) } }
    try checkCancellation()
    guard writer.status == .completed else { throw writer.error ?? NSError(domain: "MyMapRecap", code: 14) }
    success = true; return output
  }
}
