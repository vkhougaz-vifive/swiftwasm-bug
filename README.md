## Bug Reproduction

During development of an animated webassembly feature a function that takes and returns a large typed array started failing occasionally with an error similar to:

> index.ts:125 Error: The JSClosure has been already released by Swift side. The closure is created at

This repository reproduces that issue.

## Swift:

```swift
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
```

## Installation

1. Clone this repo
2. Run `yarn`
3. Run `./build-wasm.sh` - designed for mac, might not work on your system
4. Run `yarn dev`

## Expected Output

A page with numbers similar to:

```
fps: 69.50
ok: 47%

0.6486879587173462
0.7697053551673889
0.6013171076774597
0.9578807353973389
0.7919120192527771
...
```

FPS represents the fps of the resulting wasm execution

OK represents the number of times the wasm successfully executes

The console will be filling with errors

## Investigation and hacky fix

Substantial time was spent poking [JSClosure.swift](https://github.com/swiftwasm/JavaScriptKit/blob/f1ef51771550469c653f89060f8ad5a47b04ee55/Sources/JavaScriptKit/FundamentalObjects/JSClosure.swift)

This change "fixes" the issue by cloning the `JSClosure.sharedClosures` dictionary. The key is present, the value is present, the memory address changes between several values, but the guard sometimes returns nil.

```
/// Returns true if the host function has been already released, otherwise false.
@_cdecl("_call_host_function_impl")
func _call_host_function_impl(
    _ hostFuncRef: JavaScriptHostFuncRef,
    _ argv: UnsafePointer<RawJSValue>, _ argc: Int32,
    _ callbackFuncRef: JavaScriptObjectRef
) -> Bool {
    // TODO: This is some sort of horrible hack due to some sort of horrible wasm thing
    // Otherwise the sharedClone SOMETIMES fails
    let sharedClone = Dictionary(uniqueKeysWithValues: zip(JSClosure.sharedClosures.keys, JSClosure.sharedClosures.values))

    guard let (_, hostFunc) = sharedClone[hostFuncRef] else {
        return true
    }
    let arguments = UnsafeBufferPointer(start: argv, count: Int(argc)).map(\.jsValue)
    let result = hostFunc(arguments)
    let callbackFuncRef = JSFunction(id: callbackFuncRef)
    _ = callbackFuncRef(result)
    return false
}
```
