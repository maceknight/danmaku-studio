import { makeBullet, type SimBullet } from './types'

/**
 * Fixed-capacity bullet pool. Bullets are never allocated during the
 * simulation loop so the GC stays out of the frame budget.
 */
export class BulletPool {
  readonly items: SimBullet[]
  private freeList: number[]
  activeCount = 0

  constructor(capacity: number) {
    this.items = new Array(capacity)
    this.freeList = new Array(capacity)
    for (let i = 0; i < capacity; i++) {
      this.items[i] = makeBullet()
      this.freeList[i] = capacity - 1 - i
    }
  }

  get capacity() {
    return this.items.length
  }

  acquire(): SimBullet | null {
    const idx = this.freeList.pop()
    if (idx === undefined) return null
    const b = this.items[idx]
    b.active = true
    this.activeCount++
    return b
  }

  release(index: number) {
    const b = this.items[index]
    if (!b.active) return
    b.active = false
    this.freeList.push(index)
    this.activeCount--
  }

  clear() {
    this.freeList.length = 0
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].active = false
      this.freeList.push(i)
    }
    this.activeCount = 0
  }

  /** Copy every active bullet — used for seek snapshots. */
  snapshot(): SimBullet[] {
    const out: SimBullet[] = []
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i]
      if (b.active) out.push({ ...b })
    }
    return out
  }

  restore(list: SimBullet[]) {
    this.clear()
    for (let i = 0; i < list.length; i++) {
      const b = this.acquire()
      if (!b) break
      Object.assign(b, list[i])
      b.active = true
    }
  }
}
