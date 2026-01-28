import { useState, useEffect } from 'react';

/**
 * Hook para debounce de valores
 * Útil para evitar chamadas excessivas em campos de busca
 * 
 * @param value - O valor a ser debounced
 * @param delay - Tempo em ms para aguardar (padrão: 300ms)
 * @returns O valor com debounce aplicado
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
