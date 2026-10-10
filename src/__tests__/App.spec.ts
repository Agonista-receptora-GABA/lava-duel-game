import { beforeEach, describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 'polish-athletes', label: 'Polscy sportowcy' },
          { id: 'spices-and-herbs', label: 'Przyprawy i zioła' },
        ],
      }),
    )
  })
  it('mounts renders properly', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Dołącz')
  })

  it('limits the room and nick inputs to what the server accepts', () => {
    const wrapper = mount(App)

    expect(wrapper.find('input[placeholder="Room ID"]').attributes('maxlength')).toBe('64')
    expect(wrapper.find('input[placeholder="Nick"]').attributes('maxlength')).toBe('32')
  })

  it('loads category labels from the server catalog', async () => {
    const wrapper = mount(App)

    await vi.waitFor(() => expect(wrapper.text()).toContain('Polscy sportowcy'))
    expect(wrapper.text()).toContain('Przyprawy i zioła')
  })
})
