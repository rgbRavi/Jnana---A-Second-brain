import type { Plugin } from '../types'
import { eventBus } from './eventBus'

class PluginRegistry {
  private plugins = new Map<string, Plugin>()

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered`)
      return
    }
    plugin.init(eventBus)
    this.plugins.set(plugin.id, plugin)
    eventBus.emit('plugin:registered', { id: plugin.id })
    console.log(`Plugin "${plugin.name}" v${plugin.version} loaded`)
  }

  unregister(id: string): void {
    const plugin = this.plugins.get(id)
    if (!plugin) return
    plugin.destroy()
    this.plugins.delete(id)
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id)
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values())
  }
}

export const pluginRegistry = new PluginRegistry()