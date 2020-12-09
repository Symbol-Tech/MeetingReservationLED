const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const gpio = require('rpi-gpio');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = 'token.json';

let config = null

try { config = JSON.parse(fs.readFileSync('config.json')) }
catch (error) { console.log('Error loading config file:', error) }

gpio.setMode('mode_bcm');
gpio.setup(23, gpio.DIR_OUT); //R
gpio.setup(24, gpio.DIR_OUT); //G
gpio.setup(18, gpio.DIR_OUT); //B

fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  authorize(JSON.parse(content), function (auth) {
    processEvents(auth, config.calendarId)
    setInterval(function () {
      processEvents(auth, config.calendarId)
    }, config.refreshMinutes * 60 * 1000)
  });
});

function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

const ledOff = 0;
const ledGreen = 1;
const ledYellow = 2;
const ledRed = 3;

function setLed(state) {
  switch (state) {
    case ledGreen:
      console.log("Led state: GREEN");
      gpio.write(23, false);
      gpio.write(24, true);
      gpio.write(18, false);
      break;
    case ledYellow:
      console.log("Led state: YELLOW");
      gpio.write(23, true);
      gpio.write(24, true);
      gpio.write(18, false);
      break;
    case ledRed:
      console.log("Led state: RED");
      gpio.write(23, true);
      gpio.write(24, false);
      gpio.write(18, false);
      break;
    default:
      gpio.write(23, false);
      gpio.write(24, false);
      gpio.write(18, false);
      console.log("Led state: OFF");
      break;
  }
}

function processEvents(auth, calendarid) {
  let now = new Date()
  //now = new Date(1000 * (Math.round(now.getTime() / 1000) - now.getTimezoneOffset() * 60))

  console.log([now, now.getHours()])

  let state = ledOff;
  if (now.getHours() >= 9 && now.getHours() <= 16)
    if (now.getDay() != 0 && now.getDay() != 6)
      state = ledGreen;

  const calendar = google.calendar({ version: 'v3', auth });

  // calendar.calendarList.list({}, (err, res) => {
  //   if (err) return console.log('The API returned an error: ' + err);
  //   console.log(res.data.items);
  // })
  // return

  calendar.events.list({
    calendarId: calendarid,
    timeMin: (new Date()).toISOString(),
    maxResults: 1,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const events = res.data.items;

    if (events && events.length) {
      const event = events[0];

      if (event.start && event.start.dateTime && event.end && event.end.dateTime) {
        let start = new Date(event.start.dateTime);
        //start = new Date(1000 * (Math.round(start.getTime() / 1000) - start.getTimezoneOffset() * 60))
        let end = new Date(event.end.dateTime);
        //end = new Date(1000 * (Math.round(end.getTime() / 1000) - end.getTimezoneOffset() * 60))

        console.log([start, end, now])

        if (start <= now && end >= now)
          state = ledRed;
        else {
          const startdiff5min = new Date(start.getTime() - 5 * 60 * 1000)
          if (startdiff5min <= now)
            state = ledYellow;
        }
      }
    }

    setLed(state);

    // if (events.length) {
    //   console.log('Upcoming 10 events:');
    //   events.map((event, i) => {
    //     const start = event.start.dateTime || event.start.date;
    //     console.log(`${start} - ${event.summary}`);

    //     if (event.description)
    //       console.log(event.description);

    //     // if (event.location)
    //     //   console.log(event.location);

    //     // if (event.attendees && event.attendees.length)
    //     //   for (let attendee of event.attendees)
    //     //     if (attendee.email)
    //     //       console.log(attendee);

    //     console.log(event)
    //   });
    // } else {
    //   console.log('No upcoming events found.');
    // }
  });
}

