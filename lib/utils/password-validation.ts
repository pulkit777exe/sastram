export function hasNumber(value: string): boolean {
  return /\d/.test(value);
}

export function hasSpecial(value: string): boolean {
  return /[^A-Za-z0-9]/.test(value);
}

export interface PasswordValidation {
  minLength: boolean;
  includesNumber: boolean;
  includesSpecial: boolean;
  matches: boolean;
  valid: boolean;
}

export function validatePassword(password: string, confirmPassword: string): PasswordValidation {
  const minLength = password.length >= 8;
  const includesNumber = hasNumber(password);
  const includesSpecial = hasSpecial(password);
  const matches = password.length > 0 && password === confirmPassword;

  return {
    minLength,
    includesNumber,
    includesSpecial,
    matches,
    valid: minLength && includesNumber && includesSpecial && matches,
  };
}
