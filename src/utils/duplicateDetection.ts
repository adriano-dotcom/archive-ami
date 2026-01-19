/**
 * Utilities for detecting duplicate contacts based on phone number variants
 */

/**
 * Normalizes a phone number to only digits
 */
export const normalizePhone = (phone: string | null | undefined): string => {
  return phone?.replace(/\D/g, '') || '';
};

/**
 * Generates all variants of a phone number
 * (with/without country code, with/without 9th digit for Brazilian mobiles)
 */
export const getPhoneVariants = (phone: string): Set<string> => {
  const digits = normalizePhone(phone);
  const variants = new Set<string>();
  
  if (!digits || digits.length < 10) return variants;
  
  variants.add(digits);
  
  // Brazilian phone number handling
  if (digits.startsWith('55')) {
    // 13 digits: 55 + DDD(2) + 9 + 8 digits -> create version without 9
    if (digits.length === 13) {
      const withoutNine = digits.slice(0, 4) + digits.slice(5);
      variants.add(withoutNine);
      // Also add without country code
      variants.add(digits.slice(2)); // with 9
      variants.add(withoutNine.slice(2)); // without 9
    }
    // 12 digits: 55 + DDD(2) + 8 digits -> create version with 9
    else if (digits.length === 12) {
      const withNine = digits.slice(0, 4) + '9' + digits.slice(4);
      variants.add(withNine);
      // Also add without country code
      variants.add(digits.slice(2)); // without 9
      variants.add(withNine.slice(2)); // with 9
    }
  } else {
    // No country code - add with 55
    if (digits.length === 11) {
      // DDD + 9 + 8 digits
      variants.add('55' + digits);
      const withoutNine = digits.slice(0, 2) + digits.slice(3);
      variants.add(withoutNine);
      variants.add('55' + withoutNine);
    } else if (digits.length === 10) {
      // DDD + 8 digits
      variants.add('55' + digits);
      const withNine = digits.slice(0, 2) + '9' + digits.slice(2);
      variants.add(withNine);
      variants.add('55' + withNine);
    }
  }
  
  return variants;
};

/**
 * Generates a canonical key for the phone number (shortest normalized form)
 */
export const getCanonicalPhone = (phone: string): string => {
  const digits = normalizePhone(phone);
  if (!digits || digits.length < 10) return digits;
  
  // Normalize to 12-digit format (55 + DDD + 8 digits) without the 9
  let normalized = digits;
  
  // Add country code if missing
  if (!normalized.startsWith('55')) {
    normalized = '55' + normalized;
  }
  
  // Remove the 9 if present (13 -> 12 digits)
  if (normalized.length === 13 && normalized[4] === '9') {
    normalized = normalized.slice(0, 4) + normalized.slice(5);
  }
  
  return normalized;
};

/**
 * Information about a contact's duplicate status
 */
export interface DuplicateInfo {
  isDuplicate: boolean;
  groupKey: string;
  duplicateCount: number;
  duplicateIds: string[];
}

/**
 * Detects duplicate groups in a list of contacts
 */
export const detectDuplicates = (
  contacts: Array<{ id: string; phone: string; whatsapp_id?: string | null }>
): Map<string, DuplicateInfo> => {
  const phoneMap = new Map<string, string[]>(); // canonicalPhone -> contactIds
  
  // Group contacts by canonical phone
  contacts.forEach(contact => {
    const phoneDigits = normalizePhone(contact.phone);
    const whatsappDigits = normalizePhone(contact.whatsapp_id);
    const canonicalPhone = getCanonicalPhone(phoneDigits || whatsappDigits);
    
    if (!canonicalPhone || canonicalPhone.length < 10) return;
    
    if (!phoneMap.has(canonicalPhone)) {
      phoneMap.set(canonicalPhone, []);
    }
    phoneMap.get(canonicalPhone)!.push(contact.id);
  });
  
  // Create duplicate map
  const duplicateMap = new Map<string, DuplicateInfo>();
  
  phoneMap.forEach((contactIds, canonicalPhone) => {
    const isDuplicate = contactIds.length > 1;
    contactIds.forEach(id => {
      duplicateMap.set(id, {
        isDuplicate,
        groupKey: canonicalPhone,
        duplicateCount: contactIds.length,
        duplicateIds: contactIds.filter(cid => cid !== id)
      });
    });
  });
  
  return duplicateMap;
};

/**
 * Gets the total count of contacts that have duplicates
 */
export const getDuplicatesCount = (duplicateMap: Map<string, DuplicateInfo>): number => {
  let count = 0;
  duplicateMap.forEach(info => {
    if (info.isDuplicate) count++;
  });
  return count;
};

/**
 * Gets unique duplicate groups count
 */
export const getDuplicateGroupsCount = (duplicateMap: Map<string, DuplicateInfo>): number => {
  const groups = new Set<string>();
  duplicateMap.forEach(info => {
    if (info.isDuplicate) {
      groups.add(info.groupKey);
    }
  });
  return groups.size;
};
