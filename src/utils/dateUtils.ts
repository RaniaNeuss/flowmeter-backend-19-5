export const parseDate = (value?: string | Date | null): string | null => {
    if (!value) return null;
  
    const date = typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : value;
  
    return isNaN(date.getTime()) ? null : date.toISOString();
  };
  