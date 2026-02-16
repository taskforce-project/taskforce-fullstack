import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// URL de base de l'API
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

// Définir les handlers MSW pour mocker les endpoints
export const handlers = [
  // POST /auth/login
  http.post(`${API_URL}/auth/login`, async ({ request }) => {
    const body = await request.json() as any;
    
    // Mock successful login
    if (body.email === 'test@example.com' && body.password === 'Test@2024!') {
      return HttpResponse.json({
        user: {
          id: '1',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER',
        },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 3600,
      });
    }
    
    // Mock failed login
    return HttpResponse.json(
      { message: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  // POST /auth/register
  http.post(`${API_URL}/auth/register`, async ({ request }) => {
    const body = await request.json() as any;
    
    // Mock successful registration
    if (body.email && body.password) {
      return HttpResponse.json({
        userId: 'mock-user-id',
        email: body.email,
      });
    }
    
    // Mock failed registration
    return HttpResponse.json(
      { message: 'Registration failed' },
      { status: 400 }
    );
  }),

  // POST /auth/select-plan
  http.post(`${API_URL}/auth/select-plan`, async ({ request }) => {
    const body = await request.json() as any;
    
    if (body.email && body.planType) {
      return HttpResponse.json({
        message: 'Plan selected successfully',
        checkoutSessionUrl: body.planType !== 'FREE' ? 'https://checkout.stripe.com/mock' : undefined,
      });
    }
    
    return HttpResponse.json(
      { message: 'Invalid plan selection' },
      { status: 400 }
    );
  }),

  // POST /auth/verify-otp
  http.post(`${API_URL}/auth/verify-otp`, async ({ request }) => {
    const body = await request.json() as any;
    
    // Mock successful OTP verification
    if (body.email && body.otp === '123456') {
      return HttpResponse.json({
        verified: true,
        message: 'OTP verified successfully',
        authData: {
          user: {
            id: '1',
            email: body.email,
            firstName: 'Test',
            lastName: 'User',
            role: 'USER',
          },
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 3600,
        },
      });
    }
    
    // Mock failed OTP verification
    return HttpResponse.json(
      { 
        verified: false,
        message: 'Invalid OTP code' 
      },
      { status: 400 }
    );
  }),

  // POST /auth/resend-otp
  http.post(`${API_URL}/auth/resend-otp`, async ({ request }) => {
    const body = await request.json() as any;
    
    if (body.email) {
      return HttpResponse.json({
        message: 'OTP resent successfully',
        expiresIn: 300,
      });
    }
    
    return HttpResponse.json(
      { message: 'Email required' },
      { status: 400 }
    );
  }),

  // POST /auth/forgot-password
  http.post(`${API_URL}/auth/forgot-password`, async ({ request }) => {
    const body = await request.json() as any;
    
    if (body.email) {
      return HttpResponse.json({
        message: 'Password reset link sent',
      });
    }
    
    return HttpResponse.json(
      { message: 'Email required' },
      { status: 400 }
    );
  }),

  // POST /auth/logout
  http.post(`${API_URL}/auth/logout`, () => {
    return HttpResponse.json({
      message: 'Logged out successfully',
    });
  }),

  // GET /auth/me
  http.get(`${API_URL}/auth/me`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (authHeader === 'Bearer mock-access-token') {
      return HttpResponse.json({
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER',
      });
    }
    
    return HttpResponse.json(
      { message: 'Unauthorized' },
      { status: 401 }
    );
  }),
];

// Setup MSW server
export const server = setupServer(...handlers);
