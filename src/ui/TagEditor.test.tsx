import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { TagEditor } from './TagEditor'

describe('TagEditor', () => {
  it('renders auto tags and user tags differently', () => {
    const tags = ['has:media', 'idea', 'project']
    const { getByText } = render(<TagEditor tags={tags} onChange={vi.fn()} />)

    const autoTag = getByText('has:media')
    expect(autoTag.className).toContain('tagChipAuto')

    const userTag = getByText('idea')
    expect(userTag.className).toContain('tagChipUser')
  })

  it('allows adding a new user tag on Enter', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<TagEditor tags={['existing']} onChange={onChange} />)

    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: 'new-tag' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(['existing', 'new-tag'])
  })

  it('allows removing a user tag', () => {
    const onChange = vi.fn()
    const { getByLabelText } = render(<TagEditor tags={['idea']} onChange={onChange} />)

    const removeBtn = getByLabelText('Remove tag idea')
    fireEvent.click(removeBtn)

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('removes the last user tag on Backspace when input is empty', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<TagEditor tags={['idea', 'project']} onChange={onChange} />)

    const input = getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' })

    expect(onChange).toHaveBeenCalledWith(['idea']) // Removes 'project'
  })

  it('does not allow adding auto tags manually', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<TagEditor tags={[]} onChange={onChange} />)

    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: 'has:video' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    // onChange should not be called because has:video is an auto tag
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables input and removal when disabled prop is true', () => {
    const onChange = vi.fn()
    const { queryByRole, queryByLabelText } = render(<TagEditor tags={['idea']} onChange={onChange} disabled={true} />)

    expect(queryByRole('textbox')).toBeNull()
    expect(queryByLabelText('Remove tag idea')).toBeNull()
  })
})
