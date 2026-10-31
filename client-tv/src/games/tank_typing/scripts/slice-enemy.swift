import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let directory = URL(fileURLWithPath: CommandLine.arguments[1])
let config = try JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("source.json"))) as! [String: Any]
let frames = config["frames"] as! [String: [String: Any]]
let source = CGImageSourceCreateWithURL(directory.appendingPathComponent("parts-atlas.png") as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
for name in frames.keys.sorted() {
    let part = frames[name]!
    let rect = CGRect(x: part["x"] as! Int, y: part["y"] as! Int,
        width: part["width"] as! Int, height: part["height"] as! Int)
    guard let crop = image.cropping(to: rect) else { fatalError("Invalid crop: \(name)") }
    let width = crop.width, height = crop.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let bounds = pixels.withUnsafeMutableBytes { bytes -> CGRect in
        let context = CGContext(data: bytes.baseAddress, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.translateBy(x: 0, y: CGFloat(height)); context.scaleBy(x: 1, y: -1)
        context.draw(crop, in: CGRect(x: 0, y: 0, width: width, height: height))
        let data = bytes.bindMemory(to: UInt8.self)
        var minX = width, minY = height, maxX = -1, maxY = -1
        for y in 0..<height {
            for x in 0..<width where data[(y * width + x) * 4 + 3] > 24 {
                minX = min(minX, x); minY = min(minY, y)
                maxX = max(maxX, x); maxY = max(maxY, y)
            }
        }
        precondition(maxX >= minX && maxY >= minY, "Empty sprite: \(name)")
        return CGRect(x: max(0, minX - 2), y: max(0, minY - 2),
            width: min(width, maxX + 3) - max(0, minX - 2),
            height: min(height, maxY + 3) - max(0, minY - 2))
    }
    var trimmed = crop.cropping(to: bounds)!
    if part["flip"] as? Bool == true {
        let context = CGContext(data: nil, width: trimmed.width, height: trimmed.height,
            bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.translateBy(x: CGFloat(trimmed.width), y: 0); context.scaleBy(x: -1, y: 1)
        context.draw(trimmed, in: CGRect(x: 0, y: 0, width: trimmed.width, height: trimmed.height))
        trimmed = context.makeImage()!
    }
    let destination = CGImageDestinationCreateWithURL(directory.appendingPathComponent("\(name).png") as CFURL,
        UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, trimmed, nil)
    precondition(CGImageDestinationFinalize(destination))
    print("\(name): \(trimmed.width)x\(trimmed.height)")
}
