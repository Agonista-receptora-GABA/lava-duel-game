import { beforeEach, describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import { useGameStore } from '../stores/game'
import { socket } from '../socket'

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    Object.defineProperty(socket, 'id', { configurable: true, value: 'self' })
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
    const game = useGameStore()

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await flushPromises()
    game.players = [{ id: 'self', name: 'Gracz' }]
    await wrapper.vm.$nextTick()
    expect(wrapper.get('select[aria-label="Kategoria"]').text()).toContain('Polscy sportowcy')
    expect(wrapper.get('select[aria-label="Kategoria"]').text()).toContain('Przyprawy i zioła')
  })

  it('joins when the join form is submitted', async () => {
    const emit = vi.spyOn(socket, 'emit')
    const wrapper = mount(App)

    await wrapper.get('form').trigger('submit')

    expect(emit).toHaveBeenCalledWith('joinRoom', { roomId: 'pokoj-1', name: 'Gracz' })
  })

  it('only allows setting a category after joining and shows the chosen category as text', async () => {
    const wrapper = mount(App)
    const game = useGameStore()

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await flushPromises()
    expect(wrapper.find('select[aria-label="Kategoria"]').exists()).toBe(false)

    game.players = [{ id: 'self', name: 'Gracz' }]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('select[aria-label="Kategoria"]').exists()).toBe(true)

    game.categoryId = 'spices-and-herbs'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Kategoria: Przyprawy i zioła')
    expect(wrapper.find('select[aria-label="Kategoria"]').exists()).toBe(false)
  })

  it('does not offer the current player as a duel opponent', async () => {
    const wrapper = mount(App)
    const game = useGameStore()

    game.players = [
      { id: 'self', name: 'Gracz' },
      { id: 'opponent', name: 'Ala' },
    ]
    await wrapper.vm.$nextTick()

    const options = wrapper.findAll('select:not([aria-label="Kategoria"]) option')
    expect(options.map((option) => option.text())).toEqual(['Ala'])
  })

  it('keeps duel start disabled until a category is selected', async () => {
    const wrapper = mount(App)
    const game = useGameStore()

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    await flushPromises()
    game.players = [
      { id: 'self', name: 'Gracz' },
      { id: 'opponent', name: 'Ala' },
    ]
    await wrapper.vm.$nextTick()

    await wrapper.find('select:not([aria-label="Kategoria"])').setValue('opponent')
    const startButton = wrapper.findAll('button').find((button) => button.text() === 'Start 1v1')!
    expect(startButton.attributes('disabled')).toBeDefined()

    game.categoryId = 'polish-athletes'
    await wrapper.vm.$nextTick()

    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Start 1v1')
        ?.attributes('disabled'),
    ).toBeUndefined()
  })
})
