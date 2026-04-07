import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the minimal home page search experience', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /start with a search/i })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: /search albums or artists/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /library/i })).toBeInTheDocument();
});
