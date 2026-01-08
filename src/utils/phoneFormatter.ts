/**
 * Format phone number to international Brazilian format: +55 43 99909-2627
 * Accepts any input format and normalizes to standard international format
 * Smart formatting that doesn't truncate aggressively during editing
 */
export const formatPhoneInternational = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  
  // Empty input
  if (!digits) return '';
  
  // Limit to max 13 digits (55 + DDD + 9 digits)
  const trimmed = digits.slice(0, 13);
  
  // Already has country code (55)
  if (trimmed.startsWith('55')) {
    const withoutCountry = trimmed.slice(2);
    if (withoutCountry.length === 0) return '+55';
    if (withoutCountry.length <= 2) return `+55 ${withoutCountry}`;
    
    const ddd = withoutCountry.slice(0, 2);
    const number = withoutCountry.slice(2);
    
    if (number.length === 0) return `+55 ${ddd}`;
    if (number.length <= 5) return `+55 ${ddd} ${number}`;
    if (number.length <= 9) {
      // Mobile: 9 digits, split 5-4
      if (number.length === 9) {
        return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
      }
      // Landline: 8 digits, split 4-4
      if (number.length === 8) {
        return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
      }
      // In-between, just show what we have
      return `+55 ${ddd} ${number}`;
    }
    // 9 digits
    return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5, 9)}`;
  }
  
  // Without country code - assume Brazilian
  if (trimmed.length <= 2) return `+55 ${trimmed}`;
  
  const ddd = trimmed.slice(0, 2);
  const number = trimmed.slice(2);
  
  if (number.length === 0) return `+55 ${ddd}`;
  if (number.length <= 5) return `+55 ${ddd} ${number}`;
  if (number.length <= 9) {
    // Mobile: 9 digits, split 5-4
    if (number.length === 9) {
      return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    // Landline: 8 digits, split 4-4
    if (number.length === 8) {
      return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
    }
    // In-between, just show what we have
    return `+55 ${ddd} ${number}`;
  }
  
  // Max length reached
  return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5, 9)}`;
};

/**
 * Count how many digits exist before a given position in the string
 */
export const getDigitsBeforePosition = (value: string, position: number): number => {
  return value.slice(0, position).replace(/\D/g, '').length;
};

/**
 * Find the position in the formatted string that has the given number of digits before it
 */
export const getPositionForDigitCount = (formattedValue: string, digitCount: number): number => {
  let count = 0;
  for (let i = 0; i < formattedValue.length; i++) {
    if (/\d/.test(formattedValue[i])) {
      count++;
      if (count === digitCount) return i + 1;
    }
  }
  return formattedValue.length;
};

/**
 * Display formatted phone for read-only display contexts
 * Returns formatted phone or original value if cannot format
 */
export const displayPhoneInternational = (phone: string | undefined | null): string => {
  if (!phone) return '-';
  const formatted = formatPhoneInternational(phone);
  return formatted || phone;
};

/**
 * Format CPF for display: 123.456.789-00
 */
export const formatCPF = (cpf: string | undefined | null): string => {
  if (!cpf) return '';
  
  const digits = cpf.replace(/\D/g, '');
  
  if (digits.length !== 11) return cpf;
  
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

/**
 * Format CNPJ for display: 12.345.678/0001-00
 */
export const formatCNPJ = (cnpj: string | undefined | null): string => {
  if (!cnpj) return '';
  
  const digits = cnpj.replace(/\D/g, '');
  
  if (digits.length !== 14) return cnpj;
  
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

/**
 * Detect if document is CPF or CNPJ
 */
export const detectDocumentType = (doc: string): 'cpf' | 'cnpj' | 'unknown' => {
  const digits = doc.replace(/\D/g, '');
  
  if (digits.length === 11) return 'cpf';
  if (digits.length === 14) return 'cnpj';
  
  return 'unknown';
};
