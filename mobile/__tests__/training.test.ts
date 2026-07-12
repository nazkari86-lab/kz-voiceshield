import { trainingScenarios, trainingScore } from '../src/training'
import { recoveryPlans } from '../src/emergency'

describe('training and recovery content', () => {
  it('scores safe decisions', () => {
    expect(trainingScore([])).toBe(0)
    expect(trainingScore([true, false, true])).toBe(67)
    expect(trainingScore([true, true])).toBe(100)
  })

  it('offers at least one safe and unsafe decision per step', () => {
    trainingScenarios.flatMap((scenario) => scenario.steps).forEach((step) => {
      expect(step.choices.some((choice) => choice.safe)).toBe(true)
      expect(step.choices.some((choice) => !choice.safe)).toBe(true)
    })
  })

  it('provides complete recovery plans for every exposure type', () => {
    expect(new Set(recoveryPlans.map((plan) => plan.id)).size).toBe(6)
    recoveryPlans.forEach((plan) => expect(plan.steps.length).toBeGreaterThanOrEqual(4))
  })
})
