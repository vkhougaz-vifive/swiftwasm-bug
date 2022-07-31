import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";
// @ts-ignore
import { SwiftRuntime } from "javascript-kit-swift";
// @ts-ignore
import bugWasm from "./bug.wasm";

async function loadWasm<Exports>(url: string) {
  const wasmFs = new WasmFs();
  // Output stdout and stderr to console
  const originalWriteSync = wasmFs.fs.writeSync;
  // @ts-ignore - ???
  wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
    const text = new TextDecoder("utf-8").decode(buffer);

    // Filter out standalone "\n" added by every `print`, `console.log`
    // always adds its own "\n" on top.
    if (text !== "\n") {
      switch (fd) {
        case 1:
          console.log(text);
          break;
        case 2:
          console.error(text);
          break;
      }
    }
    return originalWriteSync(fd, buffer, offset, length, position);
  };

  const wasmResponse = await fetch(url);
  const wasmBytes = await wasmResponse.arrayBuffer();

  const wasi = new WASI({
    args: [],
    env: {},
    bindings: {
      ...WASI.defaultBindings,
      fs: wasmFs.fs,
    },
  });

  const swift = new SwiftRuntime();

  const importObject: Record<string, any> = {
    wasi_snapshot_preview1: wrapWASI(wasi),
    javascript_kit: swift.wasmImports,
    __stack_sanitizer: {
      report_stack_overflow: () => {
        throw new Error("Detected stack buffer overflow.");
      },
    },
  };

  const { instance } = await WebAssembly.instantiate(wasmBytes, importObject);

  // @ts-ignore
  wasi.setMemory(instance.exports.memory);
  swift.setInstance(instance);

  // @ts-ignore
  instance.exports._initialize()
  // @ts-ignore
  instance.exports.main()
}

const wrapWASI = (wasiObject: WASI) => {
  // PATCH: @wasmer-js/wasi@0.x forgets to call `refreshMemory` in `clock_res_get`,
  // which writes its result to memory view. Without the refresh the memory view,
  // it accesses a detached array buffer if the memory is grown by malloc.
  // But they wasmer team discarded the 0.x codebase at all and replaced it with
  // a new implementation written in Rust. The new version 1.x is really unstable
  // and not production-ready as far as katei investigated in Apr 2022.
  // So override the broken implementation of `clock_res_get` here instead of
  // fixing the wasi polyfill.
  // Reference: https://github.com/wasmerio/wasmer-js/blob/55fa8c17c56348c312a8bd23c69054b1aa633891/packages/wasi/src/index.ts#L557
  const original_clock_res_get = wasiObject.wasiImport["clock_res_get"];

  wasiObject.wasiImport["clock_res_get"] = (
    clockId: unknown,
    resolution: unknown
  ) => {
    wasiObject.refreshMemory();
    return original_clock_res_get(clockId, resolution);
  };
  return wasiObject.wasiImport;
};

declare function reverseFloat32Array(bytes: Float32Array): Float32Array;

const FPS_SMOOTHING = 20;

window.onload = async () => {
  let prevTime: number | undefined = undefined;
  let realFps = 0;
  let realOk = 1;

  const output = document.getElementById("output")!;
  const fps = document.getElementById("fps")!;

  function* generator() {
    for (let step = 0; step < 10000; step++) {
      yield Math.random();
    }
  }

  await loadWasm(bugWasm);

  function animate(time: DOMHighResTimeStamp) {
    if (prevTime) {
      const deltaTime = time - prevTime;
      const frameFps = (1 / deltaTime) * 1000;
      realFps = (realFps * (FPS_SMOOTHING - 1) + frameFps) / FPS_SMOOTHING;
      fps.innerHTML = `fps: ${realFps.toFixed(2)}\nok: ${Math.round(
        realOk * 100
      )}%`;
    }
    prevTime = time;

    const bytes = Float32Array.from(generator());

    let thisOk = 1;
    try {
      const reversed = reverseFloat32Array(bytes);

      output.innerHTML = reversed.join("\n");
    } catch (e) {
      console.error(e);
      thisOk = 0;
    }

    realOk = (realOk * (FPS_SMOOTHING - 1) + thisOk) / FPS_SMOOTHING;
    requestAnimationFrame(animate);
  }
  animate(performance.now());
};
