// End-to-end booking flow for restful-booker: authenticate, create, read, search,
// update, check that an unauthenticated change is rejected, then delete.
//
//   docker compose run --rm k6 run /tests/booking-crud.ts            # smoke
//   docker compose run --rm -e PROFILE=load k6 run /tests/booking-crud.ts
import { check, group } from 'k6';
import exec from 'k6/execution';
import { BookingApi } from './lib/booking-api.ts';
import { BASE_URL, CREDENTIALS, buildOptions } from './lib/config.ts';
import { newBooking, type Booking } from './lib/data.ts';

export const options = buildOptions();

const api = new BookingApi();

export function setup(): void {
  const res = api.ping();
  if (res.status !== 201) {
    exec.test.abort(`System under test is not available at ${BASE_URL} (GET /ping returned ${res.status})`);
  }
}

export default function (): void {
  const token = group('Authenticate', () => {
    const res = api.createToken(CREDENTIALS.username, CREDENTIALS.password);
    check(res, {
      'auth: status is 200': (r) => r.status === 200,
      'auth: token is issued': (r) => typeof r.json('token') === 'string',
    });
    return res.status === 200 ? (res.json('token') as string) : undefined;
  });
  if (!token) return; // nothing else in the flow works without a token

  const booking = newBooking();

  const id = group('Create booking', () => {
    const res = api.create(booking);
    check(res, {
      'create: status is 200': (r) => r.status === 200,
      'create: booking id is returned': (r) => Number.isInteger(r.json('bookingid')),
      'create: lastname is saved': (r) => r.json('booking.lastname') === booking.lastname,
    });
    return res.status === 200 ? (res.json('bookingid') as number) : undefined;
  });
  if (id === undefined) return;

  group('Read booking', () => {
    check(api.get(id), {
      'get: status is 200': (r) => r.status === 200,
      'get: returns the created booking': (r) => r.json('lastname') === booking.lastname,
    });

    check(api.findByName(booking.firstname, booking.lastname), {
      'search: status is 200': (r) => r.status === 200,
      'search: finds the booking by name': (r) =>
        (r.json() as Array<{ bookingid: number }>).some((b) => b.bookingid === id),
    });
  });

  const updated: Booking = { ...booking, totalprice: booking.totalprice + 100, additionalneeds: 'Dinner' };

  group('Update booking', () => {
    check(api.update(id, updated, token), {
      'update: status is 200': (r) => r.status === 200,
      'update: price is changed': (r) => r.json('totalprice') === updated.totalprice,
    });
  });

  group('Reject update without token', () => {
    check(api.patchWithoutToken(id, { firstname: 'Mallory' }), {
      'patch without token: status is 403': (r) => r.status === 403,
    });
    check(api.get(id), {
      'patch without token: booking is unchanged': (r) => r.json('firstname') === booking.firstname,
    });
  });

  group('Delete booking', () => {
    check(api.remove(id, token), {
      'delete: status is 201': (r) => r.status === 201,
    });
  });
}
