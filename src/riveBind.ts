import { Layout, Rive, Fit, Alignment } from '@rive-app/canvas'
import type {
  ViewModelInstance,
  ViewModelInstanceBoolean,
  ViewModelInstanceNumber,
} from '@rive-app/canvas'
import {
  REST_POSE,
  TALKING_PROPERTY,
  VISEME_KEYS,
  emptyWeights,
  poseSignature,
  type MouthPose,
  type VisemeKey,
} from './visemes'

export const ARTBOARD_NAME = 'ArtboardTest'
export const VIEW_MODEL_NAME = 'ViewModel1'
export const STATE_MACHINE_NAME = 'State Machine 1'

export type RiveMouthBinding = {
  rive: Rive
  instance: ViewModelInstance
  talking: ViewModelInstanceBoolean | null
  numbers: Partial<Record<VisemeKey, ViewModelInstanceNumber>>
  artboard: string
  stateMachines: string[]
  viewModelName: string
  missing: string[]
}

export type BindResult = {
  binding: RiveMouthBinding | null
  dump: string
}

export type RiveSession = {
  rive: Rive
  destroy: () => void
}

const lastPose = new WeakMap<Rive, string>()

function resolveInstance(rive: Rive): ViewModelInstance | null {
  const already = rive.viewModelInstance
  if (already) return already

  const vm = rive.viewModelByName(VIEW_MODEL_NAME) ?? rive.defaultViewModel() ?? rive.viewModelByIndex(0)
  if (!vm) return null
  const instance = vm.defaultInstance() ?? vm.instanceByIndex(0)
  if (!instance) return null
  rive.bindViewModelInstance(instance)
  return rive.viewModelInstance ?? instance
}

function writeWeights(instance: ViewModelInstance, pose: MouthPose): void {
  for (const key of VISEME_KEYS) {
    try {
      const prop = instance.number(key)
      if (prop) prop.value = pose.weights[key] ?? 0
    } catch {
      // ignore missing or dead properties
    }
  }
}

function writePose(instance: ViewModelInstance, pose: MouthPose): void {
  let talkingProp: ViewModelInstanceBoolean | null = null
  try {
    talkingProp = instance.boolean(TALKING_PROPERTY)
  } catch {
    talkingProp = null
  }

  if (pose.talking) {
    if (talkingProp) talkingProp.value = true
    writeWeights(instance, pose)
    return
  }

  writeWeights(instance, { ...REST_POSE, weights: emptyWeights() })
  if (talkingProp) talkingProp.value = false
}

export function applyMouthToRive(rive: Rive | null | undefined, pose: MouthPose): boolean {
  if (!rive) return false
  try {
    const instance = resolveInstance(rive)
    if (!instance) return false
    const signature = poseSignature(pose)
    if (lastPose.get(rive) === signature) return true
    writePose(instance, pose)
    lastPose.set(rive, signature)
    rive.startRendering()
    rive.drawFrame()
    return true
  } catch {
    return false
  }
}

export function applyMouth(binding: RiveMouthBinding | null, pose: MouthPose): void {
  if (applyMouthToRive(binding?.rive, pose)) return
  if (!binding) return
  writePose(binding.instance, pose)
}

export function bindMouth(rive: Rive): BindResult {
  const instance = resolveInstance(rive)
  if (!instance) {
    return { binding: null, dump: `Tidak ketemu View Model ${VIEW_MODEL_NAME}` }
  }

  const talking = instance.boolean(TALKING_PROPERTY)
  const numbers: Partial<Record<VisemeKey, ViewModelInstanceNumber>> = {}
  const missing: string[] = []
  if (!talking) missing.push(TALKING_PROPERTY)

  for (const key of VISEME_KEYS) {
    const prop = instance.number(key)
    if (prop) numbers[key] = prop
    else missing.push(key)
  }

  const binding: RiveMouthBinding = {
    rive,
    instance,
    talking,
    numbers,
    artboard: rive.activeArtboard || ARTBOARD_NAME,
    stateMachines: rive.stateMachineNames,
    viewModelName: instance.viewModelName || VIEW_MODEL_NAME,
    missing,
  }

  const found = VISEME_KEYS.filter((key) => numbers[key]).join(', ')
  return {
    binding,
    dump: missing.length === 0
      ? `${binding.artboard} / ${binding.viewModelName} · TALKING + ${VISEME_KEYS.length} viseme`
      : `${binding.viewModelName} terpasang, kurang: ${missing.join(', ')}${found ? ` · ada: ${found}` : ''}`,
  }
}

export function createRive(
  canvas: HTMLCanvasElement,
  src: string,
  onReady: (rive: Rive) => void,
  onError: (message: string) => void,
): RiveSession {
  let alive = true
  let rive: Rive

  try {
    rive = new Rive({
      src,
      canvas,
      artboard: ARTBOARD_NAME,
      stateMachines: STATE_MACHINE_NAME,
      autoplay: true,
      autoBind: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      onLoad: () => {
        if (!alive) return
        try {
          const machines = rive.stateMachineNames
          if (machines.length > 0) rive.play(machines)
          rive.resizeDrawingSurfaceToCanvas()
          rive.startRendering()
          onReady(rive)
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Gagal start Rive')
        }
      },
      onLoadError: (event) => {
        if (!alive) return
        onError(typeof event.data === 'string' ? event.data : `Gagal load ${ARTBOARD_NAME} dari mouth.riv`)
      },
    })
  } catch (error) {
    onError(error instanceof Error ? error.message : `Gagal load ${ARTBOARD_NAME} dari mouth.riv`)
    return {
      rive: null as unknown as Rive,
      destroy() {
        alive = false
      },
    }
  }

  return {
    rive,
    destroy() {
      alive = false
      try {
        rive.stop()
      } catch {
        // ignore
      }
      try {
        rive.cleanup()
      } catch {
        // ignore
      }
    },
  }
}
