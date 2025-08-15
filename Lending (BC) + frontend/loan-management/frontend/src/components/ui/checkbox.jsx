import * as React from 'react';

export const Checkbox = React.forwardRef(({ checked, onCheckedChange, disabled }, ref) => {
  return (
    <input
      type="checkbox"
      ref={ref}
      className="h-4 w-4 text-primary border-gray-300 rounded disabled:opacity-50"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      disabled={disabled}
    />
  );
});

Checkbox.displayName = "Checkbox";
