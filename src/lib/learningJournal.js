export const LEARNING_KEY = 'th-analyst-learning-v1'
export function loadLearning(storage = window.localStorage) {
  const raw = storage.getItem(LEARNING_KEY)
  if (!raw) return []
  let rows
  try { rows = JSON.parse(raw) } catch { throw new Error('Learning history is unreadable. Existing records were retained.') }
  if (!Array.isArray(rows) || rows.some(r => r.schema_version !== 'analyst-learning-v1' || typeof r.lesson_id !== 'string' || typeof r.report_id !== 'string')) throw new Error('Learning history has an unsupported schema. Existing records were retained.')
  return rows
}
export function saveLearning(lesson, choice, reflection, storage = window.localStorage) {
  if (choice !== lesson.correct_index) throw new Error('Review the evidence and correct the quiz answer before completing this lesson.')
  for (const key of ['hypothesis','counterargument','invalidation']) if (typeof reflection[key] !== 'string' || reflection[key].trim().length < 20 || reflection[key].length > 2000) throw new Error('Explain the hypothesis, counterargument and invalidation in at least 20 characters each.')
  const row = { schema_version: 'analyst-learning-v1', lesson_id: lesson.id, report_id: lesson.report_id, source_cutoff: lesson.source_cutoff, completed_at: new Date().toISOString(), answer: choice, reflection: { ...reflection }, grading: 'QUIZ_ONLY_REFLECTION_NOT_AI_GRADED', validation: 'EDUCATIONAL_NOT_STRATEGY_VALIDATION' }
  try { storage.setItem(LEARNING_KEY, JSON.stringify([...loadLearning(storage), row])) }
  catch (e) { if (e.message.includes('unreadable') || e.message.includes('unsupported')) throw e; throw new Error('Learning history could not be saved. Check browser storage.') }
  return row
}
