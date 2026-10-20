/** Calendar validation without Date's overflow normalization (February 30 etc.). */
export function validDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validTimeValue(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function localDateTimeTimestamp(value: string, label = '日期和时间') {
  if (value.length !== 16 || value[10] !== 'T' || !validDateValue(value.slice(0, 10)) || !validTimeValue(value.slice(11))) {
    throw new Error(`请输入有效的${label}`);
  }
  const date = new Date(value);
  const [hour, minute] = value.slice(11).split(':').map(Number);
  if (Number.isNaN(date.getTime()) || date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new Error(`请输入有效的${label}`);
  }
  return date.toISOString();
}
