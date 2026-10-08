import Foundation
import ImageIO
import UniformTypeIdentifiers

enum GeoMetadata {
  static func url(_ value: String) throws -> URL {
    let url = value.hasPrefix("file://") ? URL(string: value) : URL(fileURLWithPath: value)
    guard let url, url.isFileURL else { throw NSError(domain: "MyMapEXIF", code: 1) }
    let file = url.resolvingSymlinksInPath().standardizedFileURL
    let roots = [FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0], FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]]
    guard roots.contains(where: { file.path.hasPrefix($0.resolvingSymlinksInPath().path + "/") }) else { throw NSError(domain: "MyMapEXIF", code: 2) }
    return file
  }
  static func read(_ value: String) throws -> [String: Any] {
    let file = try url(value)
    guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
          let info = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
          let gps = info[kCGImagePropertyGPSDictionary as String] as? [String: Any],
          let latitude = gps[kCGImagePropertyGPSLatitude as String] as? Double,
          let longitude = gps[kCGImagePropertyGPSLongitude as String] as? Double else { return ["hasLocation": false] }
    var result: [String: Any] = ["hasLocation": true,
      "latitude": latitude * ((gps[kCGImagePropertyGPSLatitudeRef as String] as? String) == "S" ? -1 : 1),
      "longitude": longitude * ((gps[kCGImagePropertyGPSLongitudeRef as String] as? String) == "W" ? -1 : 1)]
    if let altitude = gps[kCGImagePropertyGPSAltitude as String] as? Double {
      result["altitude"] = altitude * ((gps[kCGImagePropertyGPSAltitudeRef as String] as? NSNumber)?.intValue == 1 ? -1 : 1)
    }
    return result
  }
  static func write(_ value: String, latitude: Double, longitude: Double, altitude: Double?, timestamp: Double?) throws -> Bool {
    guard latitude.isFinite, longitude.isFinite, abs(latitude) <= 90, abs(longitude) <= 180 else { return false }
    let file = try url(value)
    guard let source = CGImageSourceCreateWithURL(file as CFURL, nil), let type = CGImageSourceGetType(source) else { return false }
    let bytes = NSMutableData()
    guard let output = CGImageDestinationCreateWithData(bytes, type, 1, nil) else { return false }
    var info = (CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any]) ?? [:]
    var gps: [String: Any] = [kCGImagePropertyGPSLatitude as String: abs(latitude), kCGImagePropertyGPSLatitudeRef as String: latitude < 0 ? "S" : "N", kCGImagePropertyGPSLongitude as String: abs(longitude), kCGImagePropertyGPSLongitudeRef as String: longitude < 0 ? "W" : "E"]
    if let altitude, altitude.isFinite { gps[kCGImagePropertyGPSAltitude as String] = abs(altitude); gps[kCGImagePropertyGPSAltitudeRef as String] = altitude < 0 ? 1 : 0 }
    if let timestamp, timestamp.isFinite {
      let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy:MM:dd"
      let date = Date(timeIntervalSince1970: timestamp / 1000)
      gps[kCGImagePropertyGPSDateStamp as String] = formatter.string(from: date)
      formatter.dateFormat = "HH:mm:ss.SSS"; gps[kCGImagePropertyGPSTimeStamp as String] = formatter.string(from: date)
    }
    info[kCGImagePropertyGPSDictionary as String] = gps
    CGImageDestinationAddImageFromSource(output, source, 0, info as CFDictionary)
    guard CGImageDestinationFinalize(output) else { return false }
    try (bytes as Data).write(to: file, options: .atomic); return true
  }
}
