import http from 'k6/http';
import { check, group, sleep } from "k6";

const baseUrl =  "https://restful-booker.herokuapp.com";

export const options = {
    scenarios: {
      my_api_test:
      {
        executor: 'ramping-arrival-rate',
  
        startRate: 1,
        timeUnit: '1s',
        stages: [
          { target: 10, duration: '10s' },
          { target: 10, duration: '15s' },
          { target: 30, duration: '20s' },
          { target: 30, duration: '15s' },
          { target: 1, duration: '10s' },
        ],
        preAllocatedVUs: 1,
        maxVUs: 10000,
      }
    },
    thresholds: {
      'http_req_duration{scenario:my_api_test}': ['p(99)<900'],
    }
  };
  

export default async function () {

    let id
    let token
    let resBody;

    group("Ping", function () {
        const pingSite = http.get(`${baseUrl}/ping`, 
        null, null,
        );
        check(pingSite, { 
            'status code MUST be 201': (r) => r.status == 201 
        });
    });
    
    group('Add token', function () {
        const createToken = http.post(`${baseUrl}/auth`, 
            JSON.stringify(
                { 
                    "username" : "admin", 
                    "password" : "password123" 
                }
            ),{
            headers: 
                { 
                    'Content-Type': 'application/json' 
                },
            }
        );
        check(createToken, { 
            'status code MUST be 200': (r) => r.status == 200 
        });
        resBody = JSON.parse(createToken.body);
        token = resBody.token;
    });

    group("Create booking", function () {
        const createEntry = http.post(`${baseUrl}/booking`, 
            JSON.stringify( 
                {  
                    'firstname': 'Benjamin',  
                    'lastname' : 'Anderson',  
                    'totalprice' : 111,  
                    'depositpaid' : true,  
                    'bookingdates' : 
                        {  
                            'checkin' : '2024-01-01',  
                            'checkout' : '2025-01-01'  
                        },  
                    'additionalneeds' : 'Breakfast'  
                }  
            ),{
            headers:   
                {  
                    'Accept': 'application/json',  
                    'Content-Type':'application/json'  
                }  
            }
        );
        check(createEntry, { 
            'status code MUST be 200': (r) => r.status == 200 
        });
        resBody = JSON.parse(createEntry.body);
        id=resBody.bookingid
    });

    group('Update booking', function () {
        const updateEntry = http.put(`${baseUrl}/booking/${id}`, 
            JSON.stringify(
                {
                    "firstname" : "Auto",
                    "lastname" : "Test",
                    "totalprice" : 111,
                    "depositpaid" : true,
                    "bookingdates" : 
                        {
                            "checkin" : "2024-09-07",
                            "checkout" : "2025-09-21"
                        },
                    "additionalneeds" : "Breakfast"
                }
            ),{
            headers: 
                {
                    'Accept': "application/json",
                    'Content-Type': "application/json",
                    'Cookie': `token=${token}`
                },
            }
        );
        check(updateEntry, { 
            'status code MUST be 200': (r) => r.status == 200 
        });
    });

    group('Update booking FAIL', function () {
        const patchEntry = http.patch(`${baseUrl}/booking/${id}`, 
            JSON.stringify(
                {
                    "firstname" : "AutoTest",
                    "lastname" : "PerfTest"
                }
            ),{
            headers: 
                {
                    'Accept': "application/json",
                    'Content-Type': "application/json"
                },
            }
        );
        check(patchEntry, { 
            'status code MUST be 403': (r) => r.status == 403 
        });
    });

    group('Get booking', function () {
        const getEntry = http.get(`${baseUrl}/booking?firstname=AutoTest&lastname=PerfTest`, 
        null, null,
        );
        check(getEntry, {
            'status code MUST be 200': (res) => res.status == 200,
        })
    });

    group('Delete booking', function () {
        const deleteEntry = http.del(`${baseUrl}/booking/${id}`,
            null,
            {headers: 
                {
                    'Accept': "application/json",
                    'Cookie': `token=${token}`
                },
            },
        );
        check(deleteEntry, { 
            'status code MUST be 201': (r) => r.status == 201 
        });
    });
}