import Foundation
import ImageIO
import UniformTypeIdentifiers

let frames = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let files = try FileManager.default.contentsOfDirectory(at: frames, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
precondition(files.count == 32)
let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.gif.identifier as CFString, files.count, nil)!
CGImageDestinationSetProperties(destination, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
for file in files {
    let source = CGImageSourceCreateWithURL(file as CFURL, nil)!
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
    CGImageDestinationAddImage(destination, image, [kCGImagePropertyGIFDictionary:
        [kCGImagePropertyGIFDelayTime: 0.0625, kCGImagePropertyGIFUnclampedDelayTime: 0.0625]] as CFDictionary)
}
precondition(CGImageDestinationFinalize(destination))
print("Saved \(files.count) animation frames: \(output.lastPathComponent)")
