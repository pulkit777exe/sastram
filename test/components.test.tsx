import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ui/error-boundary';

function ThrowError({ message }: { message: string }) {
  throw new Error(message);
  return null;
}

describe('ErrorBoundary Component', () => {
  it('should render children when no error occurs', () => {
    const { container } = render(
      <ErrorBoundary>
        <div data-testid="child">Hello World</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child')).to.not.be.null;
    expect(screen.getByText('Hello World')).to.not.be.null;
  });

  it('should show fallback UI when child throws error', () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Test error" />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).to.not.be.null;
    expect(screen.getByText('Test error')).to.not.be.null;
    expect(screen.getByText('Try again')).to.not.be.null;
  });

it('should call onError callback when error occurs', () => {
    let capturedError: Error | null = null;
    const onError = (error: Error) => {
      capturedError = error;
    };

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError message="Callback test" />
      </ErrorBoundary>
    );

    expect(capturedError).to.not.be.null;
    expect(capturedError!.message).to.equal('Callback test');
  });

  it('should render custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error</div>}>
        <ThrowError message="Test error" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).to.not.be.null;
    expect(screen.getByText('Custom Error')).to.not.be.null;
  });

  it('should reset error state when Try Again is clicked', () => {
    let shouldThrow = true;
    const TestChild = () => {
      if (shouldThrow) {
        throw new Error('Initial error');
      }
      return <div data-testid="recovered">Recovered</div>;
    };

    const { rerender } = render(
      <ErrorBoundary>
        <TestChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).to.not.be.null;

    shouldThrow = false;
    fireEvent.click(screen.getByText('Try again'));

    expect(screen.getByTestId('recovered')).to.not.be.null;
  });
});

describe('OtpInput Component', () => {
  it('should render 6 input fields by default', async () => {
    const { OtpInput } = await import('@/components/auth/OtpInput');
    const onChange = () => {};

const { container } = render(
      <OtpInput value={['', '', '', '', '', '']} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).to.equal(6);
  });

  it('should render custom length input fields', async () => {
    const { OtpInput } = await import('@/components/auth/OtpInput');
    const onChange = () => {};

    const { container } = render(
      <OtpInput length={4} value={['', '', '', '']} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).to.equal(4);
  });

  it('should have numeric input mode', async () => {
    const { OtpInput } = await import('@/components/auth/OtpInput');
    const onChange = () => {};

    const { container } = render(
      <OtpInput value={['', '', '', '', '', '']} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input');
    inputs.forEach((input) => {
      expect(input.getAttribute('inputmode')).to.equal('numeric');
    });
  });

  it('should have aria-labels for accessibility', async () => {
    const { OtpInput } = await import('@/components/auth/OtpInput');
    const onChange = () => {};

    const { container } = render(
      <OtpInput value={['', '', '', '', '', '']} onChange={onChange} />
    );
    const inputs = container.querySelectorAll('input');
    expect(inputs[0].getAttribute('aria-label')).to.equal('Digit 1');
    expect(inputs[5].getAttribute('aria-label')).to.equal('Digit 6');
  });

  it('should be disabled when disabled prop is true', async () => {
    const { OtpInput } = await import('@/components/auth/OtpInput');
    const onChange = () => {};

    const { container } = render(
      <OtpInput value={['', '', '', '', '', '']} onChange={onChange} disabled />
    );
    const inputs = container.querySelectorAll('input');
    inputs.forEach((input) => {
      expect(input.disabled).to.be.true;
    });
  });
});
