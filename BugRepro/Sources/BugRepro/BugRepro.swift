import Foundation

import JavaScriptKit

func reverseArray(bytes: [Float32]) -> [Float32] {
    return [Float32](bytes.reversed())
}

let jsClosure = JSClosure { (input: [JSValue]) in
    let bytes: [Float32] = try! JSValueDecoder().decode(from: input[0])

    return reverseArray(bytes: bytes).jsValue
}

@_cdecl("main")
func main(_ i: Int32, _ j: Int32) -> Int32 {
    JSObject.global.reverseFloat32Array = .object(jsClosure)

    return 0
}
