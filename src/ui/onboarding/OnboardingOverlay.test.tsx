// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { OnboardingOverlay } from './OnboardingOverlay'
import {
  getOnboardingState,
  openOnboarding,
  closeOnboarding,
  setOnboarding,
} from '../../hooks/useOnboarding'

function reset() {
  closeOnboarding()
  setOnboarding({
    status: 'pending',
    role: null,
    comfort: null,
    launchCount: 1,
    nudgeDismissedLaunch: null,
    forceOnLaunch: false,
  })
}

describe('OnboardingOverlay', () => {
  beforeEach(() => {
    localStorage.clear()
    reset()
  })

  it('renders nothing while closed', () => {
    const { container } = render(<OnboardingOverlay />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens on the welcome card', () => {
    render(<OnboardingOverlay />)
    act(() => openOnboarding())
    expect(screen.getByText('Welcome to Jnana')).toBeInTheDocument()
  })

  it('blocks Next on a question card until it is answered', () => {
    render(<OnboardingOverlay />)
    act(() => openOnboarding())
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('What will you use Jnana for?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Student/ }))
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled()
    expect(getOnboardingState().role).toBe('student')
  })

  it('grows the deck when a power user answers the comfort question', () => {
    render(<OnboardingOverlay />)
    act(() => openOnboarding())
    const dots = () => screen.getAllByTestId('onboarding-dot').length
    expect(dots()).toBe(6) // beginner deck before any answer
    act(() => setOnboarding({ role: 'student', comfort: 'power' }))
    expect(dots()).toBe(11)
  })

  it('skip marks the state skipped and closes', () => {
    render(<OnboardingOverlay />)
    act(() => openOnboarding())
    fireEvent.click(screen.getByRole('button', { name: /skip onboarding/i }))
    expect(getOnboardingState().status).toBe('skipped')
    expect(screen.queryByText('Welcome to Jnana')).not.toBeInTheDocument()
  })

  it('does not close on Escape', () => {
    render(<OnboardingOverlay />)
    act(() => openOnboarding())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Welcome to Jnana')).toBeInTheDocument()
    expect(getOnboardingState().status).toBe('pending')
  })
})
