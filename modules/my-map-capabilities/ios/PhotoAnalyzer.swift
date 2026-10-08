import Foundation
import ImageIO
import Vision

enum PhotoAnalyzer {
  static func analyze(_ value: String) throws -> [String: Any] {
    guard let url=URL(string:value),url.isFileURL,
      let source=CGImageSourceCreateWithURL(url as CFURL,nil),
      let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:2048,kCGImageSourceCreateThumbnailWithTransform:true] as CFDictionary)
    else { throw NSError(domain:"MyMapPhoto",code:1,userInfo:[NSLocalizedDescriptionKey:"Invalid local photo"]) }
    let text=VNRecognizeTextRequest();text.recognitionLevel = .accurate;text.usesLanguageCorrection=true
    let supported=try text.supportedRecognitionLanguages()
    let languages=["vi-VN","en-US"].filter { supported.contains($0) }
    if !languages.isEmpty { text.recognitionLanguages=languages }
    let classify=VNClassifyImageRequest()
    try VNImageRequestHandler(cgImage:image,options:[:]).perform([text,classify])
    let recognized=(text.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator:"\n")
    let labels=(classify.results ?? []).filter { $0.confidence>=0.6 }.prefix(12).map { ["label":$0.identifier,"confidence":$0.confidence] as [String:Any] }
    var pixels=[UInt8](repeating:0,count:72)
    let drawn=pixels.withUnsafeMutableBytes { bytes -> Bool in
      guard let context=CGContext(data:bytes.baseAddress,width:9,height:8,bitsPerComponent:8,bytesPerRow:9,space:CGColorSpaceCreateDeviceGray(),bitmapInfo:CGImageAlphaInfo.none.rawValue) else { return false }
      context.interpolationQuality = .high;context.draw(image,in:CGRect(x:0,y:0,width:9,height:8));return true
    }
    guard drawn else { throw NSError(domain:"MyMapPhoto",code:2) }
    var hash:UInt64=0
    for y in 0..<8 { for x in 0..<8 { hash = (hash << 1) | (pixels[y*9+x]>pixels[y*9+x+1] ? 1 : 0) } }
    return ["text":String(recognized.prefix(20000)),"labels":labels,"dhash":String(format:"%016llx",hash),"provider":"Apple Vision"]
  }
}
