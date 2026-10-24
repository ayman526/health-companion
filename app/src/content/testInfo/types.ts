export interface TestInfo {
  /** What the test measures. */
  about: string
  /** What a high result can mean (numeric tests). */
  high?: string
  /** What a low result can mean (numeric tests). */
  low?: string
  /** What a positive result means (qualitative tests). */
  positive?: string
  /** General steps that help; never a dosing instruction. */
  helps?: string
}
