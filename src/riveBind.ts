import { Layout, Rive, Fit, Alignment } from '@rive-app/canvas'
import type { ViewModelInstance, ViewModelInstanceNumber } from '@rive-app/canvas'

export const NUMBER_PROPERTY = 'numberProperty'
export const ARTBOARD_NAME = 'ArtboardTest'
export const VIEW_MODEL_NAME = 'ViewModel1'
export const STATE_MACHINE_NAME = 'State Machine 1'

export type RiveNumberBinding = {
  rive: Rive
  instance: ViewModelInstance
  prop: ViewModelInstanceNumber | null
  path: string
  artboard: string
  stateMachines: string[]
  viewModelName: string
}

export type BindResult = {
  binding: RiveNumberBinding | null
  dump: string
}

export type RiveSession = {
  rive: Rive
  destroy: () => void
}

const VISEME_ANIMATION_LABELS = [
  'Default',
  'T H',
  'F V',
  'CH J SH',
  'L',
  'B M P',
  'C D G K N S T X Y Z',
  'Q U W',
  'o',
  'Ee',
  'A E I',
  'R',
] as const

const lastPlayedViseme = new WeakMap<Rive, number>()

function normName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function findVisemeAnimation(rive: Rive, viseme: number): string | null {
  const wanted = VISEME_ANIMATION_LABELS[Math.max(0, Math.min(11, Math.round(viseme)))] ?? 'Default'
  const wantedNorm = normName(wanted)
  return rive.animationNames.find((name) => name === wanted || normName(name) === wantedNorm) ?? null
}

function writeNumber(instance: ViewModelInstance | null | undefined, value: number): boolean {
  if (!instance) return false
  try {
    const prop = instance.number(NUMBER_PROPERTY)
    if (!prop) return false
    prop.value = value
    return true
  } catch {
    return false
  }
}

function playMouthShape(rive: Rive, viseme: number): void {
  const target = findVisemeAnimation(rive, viseme)
  const others = rive.animationNames.filter((name) => name !== target)
  if (others.length > 0) rive.stop(others)
  if (target) {
    rive.play(target)
    rive.scrub(target, 0)
  }
  const machines = rive.stateMachineNames
  if (machines.length > 0) rive.play(machines)
}

export function applyVisemeToRive(rive: Rive | null | undefined, value: number): boolean {
  if (!rive) return false
  try {
    let wrote = writeNumber(rive.viewModelInstance, value)
    if (!wrote) {
      const vm = rive.viewModelByName(VIEW_MODEL_NAME) ?? rive.defaultViewModel()
      const vmi = vm?.defaultInstance() ?? vm?.instanceByIndex(0) ?? null
      if (vmi) {
        rive.bindViewModelInstance(vmi)
        wrote = writeNumber(rive.viewModelInstance ?? vmi, value)
      }
    }

    const viseme = Math.max(0, Math.min(11, Math.round(value)))
    if (lastPlayedViseme.get(rive) !== viseme) {
      lastPlayedViseme.set(rive, viseme)
      playMouthShape(rive, viseme)
    }

    rive.startRendering()
    rive.drawFrame()
    return wrote
  } catch {
    return false
  }
}

export function applyViseme(binding: RiveNumberBinding | null, value: number): void {
  if (applyVisemeToRive(binding?.rive, value)) return
  if (!binding) return
  writeNumber(binding.instance, value)
  try {
    if (binding.prop) binding.prop.value = value
  } catch {
    // ignore dead instance
  }
}

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

export function bindNumberProperty(rive: Rive): BindResult {
  const instance = resolveInstance(rive)
  if (!instance) {
    return { binding: null, dump: `Tidak ketemu View Model ${VIEW_MODEL_NAME}` }
  }

  const prop = instance.number(NUMBER_PROPERTY)
  const binding: RiveNumberBinding = {
    rive,
    instance,
    prop,
    path: NUMBER_PROPERTY,
    artboard: rive.activeArtboard || ARTBOARD_NAME,
    stateMachines: rive.stateMachineNames,
    viewModelName: instance.viewModelName || VIEW_MODEL_NAME,
  }

  return {
    binding,
    dump: prop
      ? `${binding.artboard} / ${binding.viewModelName}.${NUMBER_PROPERTY}`
      : `${binding.viewModelName} terpasang, tapi ${NUMBER_PROPERTY} null`,
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
