import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Textarea } from './textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

type FieldDef =
  | { type: 'text'; id: string; label: string; placeholder?: string; required?: boolean }
  | { type: 'textarea'; id: string; label: string; placeholder?: string; required?: boolean; rows?: number }
  | { type: 'select'; id: string; label: string; options: { label: string; value: string }[]; required?: boolean }
  | { type: 'radio'; id: string; label: string; options: { label: string; value: string }[] };

interface DynamicFormProps {
  fields: FieldDef[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
  className?: string;
}

export function DynamicForm({ fields, submitLabel = 'Submit', onSubmit, className }: DynamicFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, '']))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (id: string, val: string) => {
    setValues((prev) => ({ ...prev, [id]: val }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: '' }));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      const required = field.type !== 'radio' && field.required;
      if (required && !values[field.id]?.trim()) {
        newErrors[field.id] = 'This field is required';
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(values);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {fields.map((field) => (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={field.id}>{field.label}</Label>

          {field.type === 'text' && (
            <Input
              id={field.id}
              value={values[field.id]}
              onChange={(e) => set(field.id, e.target.value)}
              placeholder={field.placeholder}
            />
          )}

          {field.type === 'textarea' && (
            <Textarea
              id={field.id}
              value={values[field.id]}
              onChange={(e) => set(field.id, e.target.value)}
              placeholder={field.placeholder}
              rows={field.rows ?? 3}
            />
          )}

          {field.type === 'select' && (
            <Select value={values[field.id]} onValueChange={(val) => val && set(field.id, val)}>
              <SelectTrigger id={field.id} className="w-full">
                <SelectValue placeholder="Select an option..." />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {field.type === 'radio' && (
            <div className="space-y-1.5">
              {field.options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <input
                    type="radio"
                    name={field.id}
                    value={opt.value}
                    checked={values[field.id] === opt.value}
                    onChange={() => set(field.id, opt.value)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-ink">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {errors[field.id] && (
            <p className="text-xs text-destructive">{errors[field.id]}</p>
          )}
        </div>
      ))}

      <Button onClick={handleSubmit} className="w-full">
        {submitLabel}
      </Button>
    </div>
  );
}

export type { FieldDef };
