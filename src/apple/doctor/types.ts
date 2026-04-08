export type DiagnosticStatus = 'pass' | 'warn' | 'fail';

export interface DiagnosticResult {
  name: string;
  status: DiagnosticStatus;
  message: string;
  fixAvailable: boolean;
  fix?: () => Promise<boolean>;
}
