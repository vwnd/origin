export type Instruction = {
  /** Stable id — part of a finding's fingerprint, so don't rename casually. */
  id: string;
  title: string;
  enabled: boolean;
  /** The task handed to the model. Markdown is fine; it is read as prose. */
  body: string;
};
