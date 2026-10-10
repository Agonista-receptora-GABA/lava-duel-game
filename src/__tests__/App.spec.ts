import { beforeEach, describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
})
