import http, { type RefinedParams, type RefinedResponse, type ResponseType } from 'k6/http';
import { BASE_URL } from './config.ts';
import type { Booking } from './data.ts';

type Response = RefinedResponse<ResponseType | undefined>;

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

// Endpoints with an id in the path get a fixed `name` tag (e.g. "PUT /booking/:id").
// Without it every booking id becomes a separate time series in InfluxDB and Prometheus.
function params(name: string, token?: string, extra: RefinedParams<ResponseType> = {}): RefinedParams<ResponseType> {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (token) headers.Cookie = `token=${token}`;
  return { headers, tags: { name }, ...extra };
}

export class BookingApi {
  constructor(private readonly baseUrl: string = BASE_URL) {}

  ping(): Response {
    return http.get(`${this.baseUrl}/ping`, params('GET /ping'));
  }

  createToken(username: string, password: string): Response {
    return http.post(`${this.baseUrl}/auth`, JSON.stringify({ username, password }), params('POST /auth'));
  }

  create(booking: Booking): Response {
    return http.post(`${this.baseUrl}/booking`, JSON.stringify(booking), params('POST /booking'));
  }

  get(id: number): Response {
    return http.get(`${this.baseUrl}/booking/${id}`, params('GET /booking/:id'));
  }

  findByName(firstname: string, lastname: string): Response {
    const query = `firstname=${encodeURIComponent(firstname)}&lastname=${encodeURIComponent(lastname)}`;
    return http.get(`${this.baseUrl}/booking?${query}`, params('GET /booking?name'));
  }

  update(id: number, booking: Booking, token: string): Response {
    return http.put(`${this.baseUrl}/booking/${id}`, JSON.stringify(booking), params('PUT /booking/:id', token));
  }

  // Negative case: a PATCH without a token must be rejected. 403 is the expected answer here,
  // so it is excluded from http_req_failed instead of being reported as an error.
  patchWithoutToken(id: number, changes: Partial<Booking>): Response {
    return http.patch(
      `${this.baseUrl}/booking/${id}`,
      JSON.stringify(changes),
      params('PATCH /booking/:id (no token)', undefined, { responseCallback: http.expectedStatuses(403) }),
    );
  }

  remove(id: number, token: string): Response {
    return http.del(`${this.baseUrl}/booking/${id}`, null, params('DELETE /booking/:id', token));
  }
}
