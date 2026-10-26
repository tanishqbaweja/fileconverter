"use client";

import { presentConversionError } from "../../lib/conversion-error-presentation";

export function ConversionError({ message }: { message: string }) {
  const presentation = presentConversionError(message);
  if (presentation.nativeDetail === null) {
    return <p className="error" role="alert">{message}</p>;
  }
  return (
    <div className="error" role="alert">
      <p className="conversion-error-summary" data-testid="conversion-error-summary">
        {presentation.summary}
      </p>
      <details className="conversion-error-details" data-testid="conversion-error-details">
        <summary>Technical details</summary>
        <p data-testid="conversion-error-native-message">{presentation.nativeDetail}</p>
      </details>
    </div>
  );
}
