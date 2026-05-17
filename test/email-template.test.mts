import { describe, it } from 'mocha';
import { expect } from 'chai';

describe('Email Template Variable Escaping', () => {
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function interpolate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const escapedKey = escapeRegex(key);
      result = result.replace(new RegExp(`{{${escapedKey}}}`, 'g'), value);
    }
    return result;
  }

  it('should replace simple variables', () => {
    const template = 'Hello {{name}}, welcome to {{site}}!';
    const result = interpolate(template, { name: 'Alice', site: 'Sastram' });
    expect(result).to.equal('Hello Alice, welcome to Sastram!');
  });

  it('should handle regex special characters in variable keys', () => {
    const template = 'Your code is {{user.code}}';
    const result = interpolate(template, { 'user.code': 'ABC123' });
    expect(result).to.equal('Your code is ABC123');
  });

  it('should handle regex special characters in variable values', () => {
    const template = 'Your reset link: {{url}}';
    const result = interpolate(template, { url: 'https://example.com/reset?token=a+b*c' });
    expect(result).to.equal('Your reset link: https://example.com/reset?token=a+b*c');
  });

  it('should not replace partial matches', () => {
    const template = 'Hello {{name}} and {{name_extra}}';
    const result = interpolate(template, { name: 'Alice' });
    expect(result).to.equal('Hello Alice and {{name_extra}}');
  });

  it('should handle multiple occurrences of the same variable', () => {
    const template = '{{name}} said hello to {{name}}';
    const result = interpolate(template, { name: 'Bob' });
    expect(result).to.equal('Bob said hello to Bob');
  });

  it('should handle dollar signs in values', () => {
    const template = 'Price: {{price}}';
    const result = interpolate(template, { price: '$10.00' });
    expect(result).to.equal('Price: $10.00');
  });
});
