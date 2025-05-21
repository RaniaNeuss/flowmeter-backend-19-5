// utils/sanitizePayload.ts

export function sanitizePayload(obj: Record<string, any>): Record<string, any> {
    if (typeof obj !== 'object' || obj === null) return obj;
  
    const cleaned = Object.entries(obj)
      .filter(([_, value]) => {
        if (value === undefined || value === null) return false;
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
        if (typeof value === 'string' && value.trim() === '') return false;
        return true;
      })
      .reduce((acc, [key, value]) => {
        acc[key] = (typeof value === 'object' && !Array.isArray(value)) ? sanitizePayload(value) : value;
        return acc;
      }, {} as Record<string, any>);
  
    return cleaned;
  }
  