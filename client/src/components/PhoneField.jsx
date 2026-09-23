import { forwardRef } from 'react';
import TextField from './TextField.jsx';

// Same rule as the server's phoneSchema (server/src/utils/validation.js): E.164, e.g. +972501234567.
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export const PHONE_FORMAT_MESSAGE = 'Use international format, e.g. +972501234567.';

// People type spaces, dashes and brackets; the server wants plain +digits.
export function normalisePhone(phone) {
  return phone.trim().replace(/[\s()-]/g, '');
}

export function isValidPhone(phone) {
  return PHONE_PATTERN.test(normalisePhone(phone));
}

// dir="ltr" keeps "+972…" reading left-to-right even when the page is Arabic.
const PhoneField = forwardRef(function PhoneField(props, ref) {
  return (
    <TextField
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      dir="ltr"
      placeholder="+972501234567"
      {...props}
    />
  );
});

export default PhoneField;
