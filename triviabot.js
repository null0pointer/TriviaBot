Array.prototype.contains = function(element){
    return this.indexOf(element) > -1;
};

var env = require('./env.json');

var DEBUG = false;

var USER_STATE_DEFAULT = 'DEFAULT';
var USER_STATE_AUTHORING_QUESTION = 'AUTHORING QUESTION';
var USER_STATE_AUTHORING_ANSWER = 'AUTHORING ANSWER';
var USER_STATE_CONFIRMING_QUESTION_SUBMISSION = 'CONFIRMING QUESTION SUBMISSION';

var MS_IN_SECOND = 1000;
var MS_IN_MINUTE = 60000;
var MS_IN_HOUR = 3600000;

var HOURS_BETWEEN_ROUNDS = 20;

var mods = new Array();
var admins = new Array();
var banned = new Array();

var user_states = new Array();

var authoring_questions = new Array();
var authoring_answers = new Array();

var pending_chat_messages = new Array();
var last_chat_message_time = 0;

var donated_amount_since_last_round = 0;

setInterval(emit_chat_message, 100);

// NEXT ROUND SCHEDULER
var next_round_timeout_id;
var next_round_warning_timeout_id;

var next_round_timeout_start_time;

start_next_round_timeouts();

// CURRENT ROUND
var current_round_number;
var current_round_questions;

var current_round_per_question_payout;

var round_currently_running = false;
var current_round_awaiting_answer = false;
var current_round_question_number;
var current_round_winners;
var current_round_answered_question_authors;
var current_round_answered_question_answer_times;

var current_question_timeout_id;
var current_question_ask_time;
var current_question_incorrect_responses;
var current_question_answered;

var request = require('request');
var url = "https://just-dice.com";
var my_uid;

var fs = require("fs");
var db_file = "trivia.db";
var chat_log_file = "logs/chat.log";
var donation_log_file = "logs/donation.log";
var privates_log_dir = "logs/privates/";
var exists = fs.existsSync(db_file);

var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database(db_file);

if (!exists) {
	db.serialize(function() {
		db.run('CREATE TABLE Question(id INTEGER PRIMARY KEY ASC, question TEXT, answers TEXT, reports INTEGER, banned INTEGER, author TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP)');
		db.run('CREATE TABLE User(uid TEXT, mod INTEGER, admin INTEGER, reports INTEGER, banned INTEGER)');
		db.run('CREATE TABLE Round(id INTEGER PRIMARY KEY ASC, questions TEXT, winners TEXT, private INTEGER, buyin TEXT, payout TEXT, commission TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP)');
		db.run('CREATE TABLE Donation(id INTEGER PRIMARY KEY ASC, uid TEXT, amount TEXT, date TEXT DEFAULT CURRENT_TIMESTAMP)');
	});
}

db.serialize(function() {
	db.run('CREATE TABLE IF NOT EXISTS Earning(id INTEGER PRIMARY KEY ASC, recipient TEXT, amount TEXT, claimed INTEGER)');
});

load_mods_admins_banned();
load_donations_since_last_round();
login_then_run_bot();

var version = '0.1.5',
    socket,
    csrf,
    uid,
    balance,
	actual_balance,
    max_profit,
    base, factor, steps, martingale = false, martingale_delay = 10,
    bet_in_progress,
    chance = '49.5',
    stake = '1',
    hilo = 'hi',
    bet_stake_threshold = 1,
    bet_profit_threshold = 1,
    show_all_my_bets = true,
    user_profit = {};
	
function load_mods_admins_banned() {
	
	// always make myself an admin regardless of what happens to the db
	admins[admins.length] = '359200';
	
	db.all("SELECT uid FROM User WHERE mod != 0 AND banned = 0", function(err, rows) {
		rows.forEach(function (row) {
			if (!mods.contains(row.uid)) {
				mods[mods.length] = row.uid;
			}
		});
	});
	
	db.all("SELECT uid FROM User WHERE admin != 0 AND banned = 0", function(err, rows) {
		rows.forEach(function (row) {
			if (!admins.contains(row.uid)) {
				admins[admins.length] = row.uid;
			}
		});
	});
	
	db.all("SELECT uid FROM User WHERE banned != 0", function(err, rows) {
		rows.forEach(function (row) {
			if (!banned.contains(row.uid)) {
				banned[banned.length] = row.uid;
			}
		});
	});
}

function load_donations_since_last_round() {
	db.all("SELECT date FROM Round ORDER BY id DESC LIMIT 1", function (err, rows) {
		var date = rows[0].date;
		db.all("SELECT amount FROM Donation WHERE date > \'" + date + "\'", function (err, rows) {
			var total = 0
			
			rows.forEach(function (row) {
				total = total + parseFloat(row.amount);
				console.log(row.amount);
	        });
			
			donated_amount_since_last_round = tidy(total);
		});
	});
}

function update_balance(data) {
	balance = data;
	db.all("SELECT amount FROM Earning WHERE claimed = 0", function (err, rows) {
		
		var unclaimed_amount = 0;
		
		rows.forEach(function (row) {
			unclaimed_amount = unclaimed_amount + parseFloat(row.amount);
        });
		
		actual_balance = tidy(parseFloat(balance) - unclaimed_amount);
	});
}

function init_readline() {
    var readline = require('readline').createInterface({
        input: process.stdin, output: process.stdout, terminal: false
    });

    readline.on('line', handle_command);

    readline.on('close', function() {
        console.log('Have a great day!');
        process.exit(0);
    });
}

var last_command;
function handle_command(txt) {
    // hit return to repeat last line
    if (txt === '') {
        if (last_command)
            return handle_command(last_command);
        txt = '.help';
    }

    last_command = txt;

    if (!socket) {
        console.log('not connected');
        return;
    }

    // lines that don't begin with a dot are sent as if entered in the chat box
    if (!txt.match(/^[.]/)) {
        send_public_message(txt);
		// send_private_message('359200', txt);
		// send_announcement(txt);
        return;
    }

    txt = txt.substring(1);

    // split command into array of words
    txt = txt.split(/\s+/);

    try {
        switch (txt[0]) {

            case 'login':
                validate_string(txt[1]);
                validate_string(txt[2]);
                console.log('attempting to log in <username> <password> [2FA code]');
                socket.emit('login', csrf, txt[1], txt[2], txt[3]);
                break;

            case 'n':
            case 'name':
                validate_string(txt[1]);
                console.log('attempting to change name to "' + txt[1] + '"');
                socket.emit('name', csrf, txt[1]);
                break;

            default:
                console.log('unknown command;', txt[0]);
                break;
        }
    } catch (err) {
        console.log(err);
    }
}

function validate_address(addr) {
    if (addr === undefined)
        throw new Error("missing required address");

    if (!addr.match(/^x[1-9a-km-zA-HJ-NP-Z]{33}$/))
        throw new Error("invalid CLAM address");
}

function validate_integer(num) {
    if (num === undefined) {
        console.log("missing required integer");
		return false;
	}

    if (!num.match(/^[1-9][0-9]*$/)) {
        console.log("number should have nothing other than digits in it");
		return false;
	}
	
	return true;
}

function validate_number(num) {
    if (num === undefined)
        throw new Error("missing required number");

    if (!num.match(/[0-9]/))
        throw new Error("number should have some digits in it");

    if (num.match(/[.].*[.]/))
        throw new Error("number should have no more than one dot in it");

    if (!num.match(/^[0-9.]*$/))
        throw new Error("number should have nothing other than digits and dots in it");
}

function validate_string(str) {
    if (str === undefined)
        throw new Error("missing required string");
}

function strip_bad_chars(str) {
	return str.replace(/'|"/g, '');
}

function jsonify_string_array(arr) {
	var json_string = '';
	
	for (i = 0; i < arr.length; i++) {
		var prefix = (i === 0) ? '[\"' : ', \"';
		var suffix = (i === arr.length - 1) ? '\"]' : '\"';
		var clean_answer = strip_bad_chars(arr[i]);
		json_string = json_string + prefix + clean_answer + suffix;
	}
	
	return json_string;
}

function dejsonify_array_string(json) {
	var decapped_json = json.substring(2, json.length - 2);
	return decapped_json.split('\", \"');
}

function tidy(val, fixed)
{
    if (fixed === undefined)
        fixed=8;

    if (typeof(val) == 'number')
        val = val.toFixed(fixed);

    val = val.replace(/([.].*?)0+$/, '$1'); // remove trailing zeroes after the decimal point
    val = val.replace(/[.]$/, '');          // remove trailing decimal point
    return val;
}

function mod(uid) {
	if (!mods.contains(uid)) {
		mods[mods.length] = uid;
		
		// INSERT OR REPLACE INTO User (uid, mod) VALUES ('<uid>', 1)
		db.run('INSERT OR REPLACE INTO User (uid, mod) VALUES (\'' + uid + '\', 1)');
	}
}

function ban_question(id) {
	db.run('UPDATE Question SET banned = 1 WHERE id = ' + id);
}

function ban_user(id) {
	
}

function start_next_round_timeouts() {
	next_round_timeout_id = setTimeout(load_round, (HOURS_BETWEEN_ROUNDS * MS_IN_HOUR));
	next_round_warning_timeout_id = setTimeout(pre_round_warning, ((HOURS_BETWEEN_ROUNDS - 0.5) * MS_IN_HOUR));
	
	next_round_timeout_start_time = (new Date).getTime();
}

function clear_next_round_timeouts() {
	clearTimeout(next_round_timeout_id);
	clearTimeout(next_round_warning_timeout_id);
}

function pre_round_warning(minutes) {
	if (minutes === undefined)
		send_announcement('Next round starting in 30 minutes. Earn CLAM when your questions are used by the bot! (\'/msg ' + uid + ' /author\')');
	else
		send_announcement('Next round starting in ' + minutes + ' minutes. Earn CLAM when your questions are used by the bot! (\'/msg ' + uid + ' /author\')');
}

function load_round() {
	
	clear_next_round_timeouts();
	
	var number_of_questions = 5;
	
	round_currently_running = true;
	current_round_questions = new Array();
	current_round_question_number = -1; // it gets incremented straight away
	current_round_winners = new Array();
	current_round_answered_question_authors = new Array();
	current_round_answered_question_answer_times = new Array();
	
	// calculate payout
	var one_percent_of_bankroll = parseFloat(actual_balance) * 0.01;
	var total_payout = one_percent_of_bankroll;
	if ((donated_amount_since_last_round - 1) > total_payout) {
		total_payout = donated_amount_since_last_round - 1;
	}
	
	// the total payout is either 1% of bankroll or the amount tipped minus 2 CLAM since last round. whichever is larger.
	current_round_per_question_payout = tidy(total_payout / (number_of_questions + 1));
	donated_amount_since_last_round = 0;
	
	db.all("SELECT * FROM Question WHERE banned = 0 ORDER BY RANDOM() LIMIT " + number_of_questions, function(err, rows) {
		rows.forEach(function (row) {
			question = new Array();
			question['question'] = row.question;
			question['answers'] = dejsonify_array_string(row.answers);
			question['id'] = row.id.toString();
			question['author'] = row.author;

			current_round_questions[current_round_questions.length] = question;
        });

		db.all("SELECT COUNT(*) AS count FROM Round", function (err, rows) {
			current_round_number = rows[0]['count'] + 1;

			begin_round();

		});
	});
}

function begin_round() {
	console.log('beginning round');
	console.log(current_round_questions);
	
	send_announcement('Beginning Round No. ' + current_round_number);
	send_announcement('You MUST answer questions in a private message to the bot. (ie. \'/msg ' + uid + ' <answer>\')');
	
	ask_next_question();
}

function skip_question(reason) {
	console.log('skipping question: ' + reason);
	send_announcement('Skipping question: ' + reason);
	current_round_awaiting_answer = false;
	send_announcement('Next question in 1 minute.');
	setTimeout(announce_incorrect_responses, 15000);
	setTimeout(ask_next_question, 60000);
}

function announce_incorrect_responses() {
	current_round_awaiting_answer = false;
	
	console.log('incorrect answers: ' + current_question_incorrect_responses);
	if (current_question_incorrect_responses.length > 0) {
		send_announcement('Incorrect responses: ' + current_question_incorrect_responses);
	} else {
		send_announcement('No incorrect responses.');
	}
}

function ask_next_question() {
	current_round_question_number = current_round_question_number + 1;
	console.log('asking question');
	var question = current_round_questions[current_round_question_number];
	current_question_incorrect_responses = new Array();
	console.log('Question ' + (current_round_question_number + 1) + ' of ' + current_round_questions.length + ' authored by ' + question['author'] + ' for ' + current_round_per_question_payout + ' CLAM (QuestionID: ' + question['id'] + ')');
	console.log(question['question']);
	send_announcement('Question ' + (current_round_question_number + 1) + ' of ' + current_round_questions.length + ' authored by ' + question['author'] + ' for ' + current_round_per_question_payout + ' CLAM (QuestionID: ' + question['id'] + ')');
	send_announcement(question['question']);
	current_question_ask_time = (new Date).getTime();
	current_question_timeout_id = setTimeout(function(){skip_question('5 minutes passed without correct answer.')}, 300000);
	current_round_awaiting_answer = true;
	current_question_answered = false;
}

function check_answer(sender_uid, sender_name, answer) {
	
	console.log('checking answer');
	
	var question = current_round_questions[current_round_question_number];
	var answers = question['answers'];
	var answer_correct = false;
	for (i = 0; i < answers.length; i++) {
		if (answer.toLowerCase() === answers[i].toLowerCase()) {
			answer_correct = true;
			break;
		}
	}
	
	if (answer_correct) {
		if (sender_uid === question['author'] && DEBUG == false) {
			send_private_message(sender_uid, 'You answered the question correctly but you cannot answer your own question.');
		} else if (current_round_winners.contains(sender_uid) && DEBUG == false) {
			send_private_message(sender_uid, 'You answered the question correctly but to keep it fair and fun you can only win once per round.');
		} else if (current_question_answered == false) {
			send_announcement('(' + sender_uid + ') <' + sender_name + '> answered correctly with \'' + answer + '\'');
			current_round_winners[current_round_winners.length] = sender_uid;
			current_round_answered_question_authors[current_round_answered_question_authors.length] = question['author'];
			var current_time = (new Date).getTime();
			current_round_answered_question_answer_times[current_round_answered_question_answer_times.length] = (current_time - current_question_ask_time);
			current_question_answered = true;
			clearTimeout(current_question_timeout_id);
			
			if ((current_round_question_number + 1) /* don't actually want to increment it yet */ < current_round_questions.length) {
				send_announcement('Next question in 1 minute.');
				
				if (DEBUG) {
					setTimeout(ask_next_question, 5000);
				} else {
					setTimeout(ask_next_question, 60000);
				}
			} else {
				// 16s so that it happens after the incorect answers for the last question are announced.
				setTimeout(finish_round, 16000);
			}
			
			if (DEBUG) {
				announce_incorrect_responses();
			} else {
				setTimeout(announce_incorrect_responses, 15000);
			}
		}
	} else {
		if (!current_question_incorrect_responses.contains(answer)) {
			current_question_incorrect_responses[current_question_incorrect_responses.length] = answer;
		}
	}
}

function finish_round() {
	start_next_round_timeouts();
	console.log('finishing round');
	round_currently_running = false;
	send_announcement('The round is over, congratulations to all our winners!');
	payout_current_round_winners();
	add_question_author_earnings();
	save_current_round_to_db();
}

function payout_current_round_winners() {
	send_multi_tip(current_round_winners, current_round_per_question_payout, 'each');
}

function add_question_author_earnings() {
	var amount = parseFloat(current_round_per_question_payout) / current_round_questions.length;
	for (i = 0; i < current_round_answered_question_authors.length; i++) {
		var recipient_uid = current_round_answered_question_authors[i];
		
		if (recipient_uid === '1196765') {
			recipient_uid = '359200';
		}
		
		var base_amount = (0.1 * amount);
		var variable_amount = (0.9 * amount * (current_round_answered_question_answer_times[i] / 300000));
		var adjusted_amount = tidy(base_amount + variable_amount);
		console.log(recipient_uid + ': ' + adjusted_amount);
		
		db.run('INSERT INTO Earning(recipient, amount, claimed) VALUES(\'' + recipient_uid + '\', \'' + adjusted_amount + '\', \'0\')');
	}
}

function save_current_round_to_db() {
	var question_ids = new Array();
	
	for (i = 0; i < current_round_questions.length; i++) {
		question_ids[question_ids.length] = current_round_questions[i]['id'];
	}
	
	var questions_json = jsonify_string_array(question_ids);
	var winners_json = jsonify_string_array(current_round_winners);
	var total_payout = current_round_per_question_payout * current_round_winners.length;
	total_payout = total_payout.toString();
	
	db.run('INSERT INTO Round(questions, winners, private, buyin, payout, commission) VALUES(\'' + questions_json + '\', \'' + winners_json + '\', 0, \'0\', \'' + total_payout + '\', \'' + current_round_per_question_payout + '\')')
}

function log_chat_message(log) {
	console.log(log);
	fs.appendFileSync(chat_log_file, log + '\n');
}

function log_public_chat_message(sender_uid, message, date) {
	var log = date + ' - PUBLIC from ' + sender_uid + ': ' + message;
	log_chat_message(log);
}

function log_announcement_message(sender_uid, message, date) {
	var log = date + ' - ANNOUNCEMENT from ' + sender_uid + ': ' + message;
	log_chat_message(log);
}

function log_private_message(log, file) {
	console.log(log);
	fs.appendFileSync(privates_log_dir + file, log + '\n');
}

function log_received_private_message(sender_uid, message, date) {
	
	// The date field is empty for private messages...
	date = new Date();
	
	var log = date + ' - PRIVATE from ' + sender_uid + ': ' + message;
	var file = sender_uid + '.log';
	log_private_message(log, file);
}

function log_sent_private_message(recipient_uid, message, date) {
	var log = date + ' - PRIVATE to ' + recipient_uid + ': ' + message;
	var file = recipient_uid + '.log';
	log_private_message(log, file);
}

function log_donation(donor_uid, amount) {
	date = new Date();
	var log = date + ' - DONATION from ' + donor_uid + ': ' + amount;
	fs.appendFileSync(donation_log_file, log + '\n');
}

function tell_user_question_details(recipient_uid, question_uid) {
	db.all("SELECT * FROM Question WHERE id = \'" + question_uid + "\'", function(err, rows) {
		if (rows.length == 0) {
			send_private_message(recipient_uid, 'Question not found.');
		} else {
			rows.forEach(function (row) {
				if (row.author === recipient_uid || admins.contains(recipient_uid)) {
					if (row.banned != 0) {
						send_private_message(recipient_uid, 'BANNED QUESTION');
					}
					send_private_message(recipient_uid, 'Author: ' + row.author);
					send_private_message(recipient_uid, row.question);
					send_private_message(recipient_uid, row.answers);
				} else {
					send_private_message(recipient_uid, 'You do not have permission to read this question.');
				}
			});
		}
	});
}

function tell_user_number_of_questions(recipient_uid, questions_uid) {
	db.all("SELECT COUNT(*) AS count FROM Question WHERE banned = 0", function (err, rows) {
		var question_count = rows[0]['count'];
		db.all("SELECT COUNT(*) AS count FROM Question WHERE banned = 1", function (err, rows) {
			var banned_count = rows[0]['count'];

			send_private_message(recipient_uid, 'The bot currently knows ' + question_count + ' questions with ' + banned_count + ' banned questions (' + (question_count + banned_count) + ' total).');
			
			db.all("SELECT id FROM Question WHERE author = \'" + questions_uid + "\' ORDER BY id", function (err, rows) {
				var question_ids = new Array();
				
				rows.forEach(function (row) {
					question_ids[question_ids.length] = row.id;
		        });
				
				if (question_ids.length > 0) {
					var questions_string = question_ids[0];
					
					for (i = 1; i < question_ids.length; i++) {
						questions_string = questions_string + ', ' + question_ids[i];
					}
				
					send_private_message(recipient_uid, 'Your questions: ' + questions_string);
				} else {
					send_private_message(recipient_uid, 'You have written no questions.');
				}
			});
		});
	});
}

function tell_user_details(recipient_uid, user_uid) {
	db.all("SELECT amount FROM Donation WHERE uid = \'" + user_uid + "\'", function(err, rows) {
		
		var donated_amount = 0;
		
		rows.forEach(function (row) {
			donated_amount = donated_amount + parseFloat(row.amount);
        });
		
		db.all("SELECT COUNT(*) AS count FROM Question WHERE author = \'" + user_uid + "\'", function (err, rows) {
			var question_count = rows[0]['count'];
			
			db.all("SELECT amount, claimed FROM Earning WHERE recipient = \'" + user_uid + "\'", function (err, rows) {
				
				var unclaimed_amount = 0;
				var total_amount = 0;
				
				rows.forEach(function (row) {
					total_amount = total_amount + parseFloat(row.amount);
					if (row.claimed == 0) {
						unclaimed_amount = unclaimed_amount + parseFloat(row.amount);
					}
		        });
				
				donated_amount = tidy(donated_amount);
				unclaimed_amount = tidy(unclaimed_amount);
				total_amount = tidy(total_amount);
				
				send_private_message(recipient_uid, 'You have donated ' + donated_amount + ' CLAM and contributed ' + question_count + ' questions.');
				send_private_message(recipient_uid, 'You have ' + unclaimed_amount + ' CLAM unclaimed out of ' + total_amount + ' CLAM in total question earnings.');
			});
		});
	});
}

function tell_user_top_donors(recipient_uid) {
	var all_donors = new Array();
	var donor_uids = new Array();
	
	db.all("SELECT uid, amount FROM Donation", function(err, rows) {
		rows.forEach(function (row) {
			
			var already_seen = false;
			for (i = 0; i < donor_uids.length; i++) {
				if (donor_uids[i] === row.uid) {
					already_seen = true;
					break;
				}
			}
			
			if (already_seen === false) {
				donor_uids[donor_uids.length] = row.uid;
			}
			
			total_amount = all_donors[row.uid];
			
			if (total_amount === undefined) {
				total_amount = parseFloat(row.amount);
			} else {
				total_amount = total_amount + parseFloat(row.amount);
			}
			
			all_donors[row.uid] = total_amount;
        });
	
		// ['id (n clams)', 'id (n clams)', 'id (n clams)', 'id (n clams)', ...]
		var top_donors = new Array();
		var number_of_donors = 10;
		if (donor_uids.length < number_of_donors) number_of_donors = donor_uids.length;
		for (i = 0; i < number_of_donors; i++) {
			var top_donor = donor_uids[0];
			for (j = 1; j < donor_uids.length; j++) {
				if (all_donors[donor_uids[j]] > all_donors[top_donor]) {
					top_donor = donor_uids[j];
				}
			}
			top_donors[i] = top_donor + ' (' + tidy(all_donors[top_donor]) + ' CLAM)';
			donor_uids.splice(donor_uids.indexOf(top_donor), 1);
		}
		
		var top_donors_string = '';
		for (i = 0; i < top_donors.length; i++) {
			var prefix = (i + 1) + '. ';
			var suffix = (i === top_donors.length - 1) ? '' : ', ';
			top_donors_string = top_donors_string + prefix + top_donors[i] + suffix;
		}
		
		send_private_message(recipient_uid, top_donors_string);
	});
}

function tell_user_top_authors(recipient_uid) {
	db.all("SELECT author, COUNT(author) as count FROM Question GROUP BY author ORDER BY COUNT(author) DESC LIMIT 10", function(err, rows) {
		
		var authors_string = '';
		var rank = 1;
		
		rows.forEach(function (row) {
			var author = row.author;
			if (recipient_uid === author) {
				author = 'You';
			}
			authors_string = authors_string + rank + '. ' + author + ' (' + row.count + ' q\'s) ';
			rank = rank + 1;
		});
		
		send_private_message(recipient_uid, authors_string);
	});
}

function tell_user_unclaimed_earnings(recipient_uid) {
	db.all("SELECT amount FROM Earning WHERE claimed = 0", function (err, rows) {
		var unclaimed_amount = 0;
		
		rows.forEach(function (row) {
			unclaimed_amount = unclaimed_amount + parseFloat(row.amount);
        });
		
		unclaimed_amount = tidy(unclaimed_amount);
		
		send_private_message(recipient_uid, 'There are currently ' + unclaimed_amount + ' CLAM in unclaimed earnings.');
	});
}

function tell_user_next_round(recipient_uid) {
	if (round_currently_running) {
		send_private_message(recipient_uid, 'Round currently running.');
		return;
	}
	
	var current_time = (new Date).getTime();
	var time_remaining = (HOURS_BETWEEN_ROUNDS * MS_IN_HOUR) - (current_time - next_round_timeout_start_time);
	var hours = Math.floor(time_remaining / MS_IN_HOUR);
	time_remaining = time_remaining - (hours * MS_IN_HOUR);
	var minutes = Math.floor(time_remaining / MS_IN_MINUTE);
	time_remaining = time_remaining - (minutes * MS_IN_MINUTE);
	var seconds = Math.floor(time_remaining / MS_IN_SECOND);
	
	send_private_message(recipient_uid, 'Next round in ' + hours + 'h ' + minutes + 'm ' + seconds + 's or start it now by tipping ' + tidy(1.0 - donated_amount_since_last_round) + ' CLAM.');
}

function claim_question_earnings(recipient_uid) {
	db.all("SELECT amount FROM Earning WHERE recipient = \'" + recipient_uid + "\' AND claimed = 0", function (err, rows) {
		
		var unclaimed_amount = 0;
		
		rows.forEach(function (row) {
			unclaimed_amount = unclaimed_amount + parseFloat(row.amount);
        });
		
		unclaimed_amount = tidy(unclaimed_amount);
		
		if (unclaimed_amount > 0) {
			db.run('UPDATE Earning SET claimed = 1 WHERE recipient = ' + recipient_uid);
			send_tip(recipient_uid, true, unclaimed_amount, 'TriviaBot question earnings withdrawal');
			send_private_message(recipient_uid, 'Earnings withdrawn.');
		} else {
			send_private_message(recipient_uid, 'You have no unclaimed earnings.');
		}
	});
}

function receive_tip(sender_uid, sender_name, amount, announce) {
	donated_amount_since_last_round = parseFloat(donated_amount_since_last_round);
	console.log(typeof donated_amount_since_last_round + '   ' + donated_amount_since_last_round);
	console.log(typeof amount + '   ' + amount);
	donated_amount_since_last_round = parseFloat(donated_amount_since_last_round) + parseFloat(amount);
	console.log(typeof donated_amount_since_last_round + '   ' + donated_amount_since_last_round);
	
	log_donation(sender_uid, amount);
	db.run('INSERT INTO Donation(uid, amount) VALUES(\'' + sender_uid + '\', \'' + amount + '\')');
	
	if (donated_amount_since_last_round >= 1) {
		if (announce === true) {
			var announcement = 'Thank you <' + sender_name + '> for the ' + amount + ' CLAM donation!';
			send_announcement(announcement);
		}

		if (!round_currently_running) {
			load_round();
		}
		
	} else {
		if (announce === true) {
			var announcement = 'Thank you <' + sender_name + '> for the ' + amount + ' CLAM donation! ' + tidy(1.0 - donated_amount_since_last_round) + ' CLAM needed for next round.';
			send_announcement(announcement);
		}
	}
}

function send_tip(recipient_uid, private_tip, amount, message) {
	// in the case the amount is an integer, the /tip command needs a decimal point in the amount
	if (amount.indexOf('.') === -1) {
		amount = amount + '.0';
	}
	
	var private_arg = (private_tip) ? 'private ' : '';
	var tip = '/tip noconf ' + private_arg + recipient_uid + ' ' + amount + ' \"' + message + '\"';
	
	if (DEBUG) {
		send_private_message('359200', tip);
	} else {
		send_public_message(tip);
	}
}

function send_multi_tip(recipients, amount, each_split) {
	// in the case the amount is an integer, the /tip command needs a decimal point in the amount
	if (amount.indexOf('.') === -1) {
		amount = amount + '.0';
	}
	
	if (recipients.length > 0) {
		var recipients_list = recipients[0];
		for (i = 1; i < recipients.length; i++) {
			recipients_list = recipients_list + ',' + recipients[i];
		}
		var tip = '/tip noconf ' + recipients_list + ' ' + amount + ' ' + each_split;
		console.log(tip);
		
		if (DEBUG) {
			send_private_message('359200', tip);
		} else {
			send_public_message(tip);
		}
	}
}

// 3s between messages, up to 4 pending, send 4 messages at the same time but have to wait 12s for them to go through
function emit_chat_message() {
	if (pending_chat_messages.length > 0) {
		var current_time = (new Date).getTime();
		if (current_time - last_chat_message_time >= 3000) {
			socket.emit('chat', csrf, pending_chat_messages[0]);
			pending_chat_messages.splice(0, 1);
			last_chat_message_time = current_time;
		}
	}
}

// 256 Character Limit (including commands)

function add_message_to_queue(message) {
	pending_chat_messages[pending_chat_messages.length] = message;
}

function send_public_message(message) {
	if (message.length <= 256) {
		add_message_to_queue(message);
	} else {
		var message_extra = message.substring(256, message.length);
		message = message.substring(0, 256);
		add_message_to_queue(message);
		send_public_message(message_extra);
	}
}

function send_private_message(recipient_uid, message) {
	var command_prefix = '/msg ' + recipient_uid + ' ';
	if (command_prefix.length + message.length <= 256) {
		var txt = command_prefix + message;
		add_message_to_queue(txt);
	} else {
		var message_extra = message.substring((256 - command_prefix.length), message.length);
		message = message.substring(0, (256 - command_prefix.length));
		var txt = command_prefix + message;
		add_message_to_queue(txt);
		send_private_message(recipient_uid, message_extra);
	}
	
	var date = new Date();
	log_sent_private_message(recipient_uid, message, date);
}

function send_announcement(message) {
	var command_prefix = '/me ';
	if (command_prefix.length + message.length <= 256) {
		var txt = command_prefix + message;

		if (DEBUG) {
			send_private_message('359200', message);
		} else {
			add_message_to_queue(txt);
		}
	} else {
		var message_extra = message.substring((256 - command_prefix.length), message.length);
		message = message.substring(0, (256 - command_prefix.length));
		var txt = command_prefix + message;
		
		if (DEBUG) {
			send_private_message('359200', message);
		} else {
			add_message_to_queue(txt);
		}
		
		send_announcement(message_extra);
	}
}

function classify_and_handle_chat(txt, date) {
	
	var sender_uid = txt.substring(txt.indexOf('(') + 1, txt.indexOf(')'));
	var sender_name = txt.substring(txt.indexOf('<') + 1, txt.indexOf('>'));
	
	switch(txt.substring(0, 1)) {
		case '(':
			var message = txt.substring(txt.indexOf('>') + 2, txt.length);
			
			if (txt.substring(txt.indexOf(')') + 2, txt.indexOf(')') + 3) === '*') {
				// announcement
				// (sender_uid) * <sender_name> message
				receive_announcement(sender_uid, sender_name, message, date);
			} else {
				// public message
				// (sender_uid) <sender_name> message
				receive_public_message(sender_uid, sender_name, message, date);
			}
			break;
			
		case '[':
			// private message
			// [ (sender_uid) <sender_name> → (recipient_uid) <recipient_name> ] message
			var message = txt.substring(txt.indexOf(']') + 2, txt.length);
			receive_private_message(sender_uid, sender_name, message, date);
			break;
	}
}

function receive_public_message(sender_uid, sender_name, message, date) {
	log_public_chat_message(sender_uid, message, date);
}

function receive_private_message(sender_uid, sender_name, message, date) {
	if (sender_uid === my_uid)
		return;
	
	log_received_private_message(sender_uid, message, date);
	
	user_state = user_states[sender_uid];
	
	switch (user_state) {
		case USER_STATE_AUTHORING_QUESTION:
		case USER_STATE_AUTHORING_ANSWER:
			handle_private_message_authoring(sender_uid, message);
			break;
			
		case USER_STATE_CONFIRMING_QUESTION_SUBMISSION:
			handle_private_message_confirming_question_submission(sender_uid, message);
			break;
			
		case undefined:
			user_states[sender_uid] = USER_STATE_DEFAULT;
		case USER_STATE_DEFAULT:
			handle_private_message_default(sender_uid, sender_name, message);
			break;
	}
}

function receive_announcement(sender_uid, sender_name, message, date) {
	log_announcement_message(sender_uid, message, date);
}

function handle_private_message_default(sender_uid, sender_name, message) {
	commands = message.split(' ');
	
	switch (commands[0]) {
		case '/help':
		case '/help':
			send_private_message(sender_uid, 'Available commands: /man <command> (for more info on a command), /info, /next, /author, /me, /donors, /authors, /questions, /read, /edit, /balance, /unclaimed, /claim, /report [q/u] <id>');
			break;
		
		case '/info':
			send_private_message(sender_uid, 'TriviaBot is a bot for automating trivia contests where CLAMs are awarded for correct answers. My creator is (359200) <null>.');
			break;
			
		case '/next':
			tell_user_next_round(sender_uid);
			break;
			
		case '/author':
			user_states[sender_uid] = USER_STATE_AUTHORING_QUESTION;
			send_private_message(sender_uid, 'Submit your new trivia question as a private message. Once your question is received you will be asked for the answer(s). Type /guidelines to see the question guidelines. Type /cancel to cancel authoring. Type /delete to delete last answer.');
			break;
		
		case '/me':
			if (commands.length > 1 && admins.contains(sender_uid)) {
				var uid = commands[1];
				if (validate_integer(uid)) {
					tell_user_details(sender_uid, uid);
				} else {
					send_private_message(sender_uid, 'Invalid user id.');
				}
			} else {
				tell_user_details(sender_uid, sender_uid);
			}
			break;
		
		case '/donors':
			tell_user_top_donors(sender_uid);
			break;
			
		case '/authors':
			tell_user_top_authors(sender_uid);
			break;
			
		case '/report':
			send_private_message(sender_uid, 'Not implemented');
			break;
			
		case '/mods':
			send_private_message(sender_uid, mods);
			break;
			
		case '/admins':
			send_private_message(sender_uid, admins);
			break;
			
		case '/questions':
			if (commands.length > 1 && admins.contains(sender_uid)) {
				var uid = commands[1];
				if (validate_integer(uid)) {
					tell_user_number_of_questions(sender_uid, uid);
				} else {
					send_private_message(sender_uid, 'Invalid user id.');
				}
			} else {
				tell_user_number_of_questions(sender_uid, sender_uid);
			}
			break;
			
		case '/read':
			if (commands.length > 1) {
				var quid = commands[1];
				if (validate_integer(quid)) {
					tell_user_question_details(sender_uid, quid);
				} else {
					send_private_message(sender_uid, 'Invalid question id.');
				}
			} else {
				send_private_message(sender_uid, 'Usage: /read <question id>');
			}
			break;
			
		case '/balance':
			send_private_message(sender_uid, actual_balance + ' CLAM');
			break;
			
		case '/unclaimed':
			tell_user_unclaimed_earnings(sender_uid);
			break;
			
		case '/claim':
			claim_question_earnings(sender_uid);
			break;
			
		case '/man':
			if (commands.length >= 2) {
				switch (commands[1]) {
					case '/help':
					case 'help':
						send_private_message(sender_uid, 'See a list of available commands.');
						break;
						
					case '/info':
					case 'info':
						send_private_message(sender_uid, 'Find out more information about this bot.');
						break;
						
					case '/next':
					case 'next':
						send_private_message(sender_uid, 'Find out when the next round is.');
						break;
				
					case '/author':
					case 'author':
						send_private_message(sender_uid, 'Author a new question with one or many accepted answers.');
						break;
				
					case '/me':
					case 'me':
						send_private_message(sender_uid, 'See a list of the questions you have authored.');
						break;
				
					case '/donors':
					case 'donors':
						send_private_message(sender_uid, 'See a list of people who have funded the trivia.');
						break;
						
					case '/authors':
					case 'authors':
						send_private_message(sender_uid, 'See a list of the top authors.');
						break;
					
					case '/report':
					case 'report':
						send_private_message(sender_uid, '(Not implemented) Report users who are abusing the bot or questions which are bad. \'report u <user id>\' to report a user. \'report q <question id>\' to report a question.');
						break;
						
					case '/questions':
					case 'questions':
						send_private_message(sender_uid, 'Find out how smart the bot is.');
						break;
						
					case '/balance':
					case 'balance':
						send_private_message(sender_uid, 'Find out how big the bots bankroll is.');
						break;
						
					case '/unclaimed':
					case 'unclaimed':
						send_private_message(sender_uid, 'Find out how much the bot owes.');
						break;
						
					case '/claim':
					case 'claim':
						send_private_message(sender_uid, 'Claim your question earnings.');
						break;
				
					case '/man':
					case 'man':
						send_private_message(sender_uid, 'What are you doing?');
						break;
					
					default:
						send_private_message(sender_uid, 'Unknown command \'' + commands[1] + '\'. Type /help for a list of available commands.');
						break;
				}
			} else {
				send_private_message(sender_uid, 'No command provided. Type /man <command> to find out more about a command.');
			}
			break;
			
		case '/add_donation': // TODO: add some validation for this function it is very very injectable.
			if (admins.contains(sender_uid)) {
				receive_tip(commands[1], '', commands[2], false);
				send_private_message(sender_uid, 'Added ' + commands[2] + ' CLAM donation from ' + commands[1]);
			} else {
				send_private_message(sender_uid, 'You do not have permission for this.');
			}
			break;
			
		case '/mod':
			if (admins.contains(sender_uid)) {
				if (mods.contains(commands[1])) {
					send_private_message(sender_uid, commands[1] + ' is already a mod.');
				} else {
					mod(commands[1]);
					send_private_message(sender_uid, 'Modded ' +  commands[1]);
					send_private_message(commands[1], 'You have been made a mod of TriviaBot by ' + sender_uid);
				}
			} else {
				send_private_message(sender_uid, 'You do not have permission for this.');
			}
			break;
			
		case '/ban':
			if (admins.contains(sender_uid)) {
				if (commands[1] == 'q') {
					ban_question(commands[2]);
					send_private_message(sender_uid, 'Banned question ' + commands[2]);
				} else if (commands[1] == 'u') {
					send_private_message(sender_uid, 'Not implemented');
				}
			} else {
				send_private_message(sender_uid, 'You do not have permission for this.');
			}
			break;
			
		case '/start_round':
			if (admins.contains(sender_uid) || mods.contains(sender_uid)) {
				if (commands.length > 1) {
					var minutes = commands[1];
					if (validate_integer(minutes)) {
						pre_round_warning(minutes);
						setTimeout(load_round, (minutes * MS_IN_MINUTE));
					} else {
						send_private_message(sender_uid, 'Invalid delay length.');
					}
				} else {
					load_round();
					send_private_message(sender_uid, 'Starting round.');
				}
			} else {
				send_private_message(sender_uid, 'You do not have permission for this.');
			}
			break;
			
		default:
			if(round_currently_running) {
				if (current_round_awaiting_answer) {
					check_answer(sender_uid, sender_name, message);
				}
			} else {
				send_private_message(sender_uid, 'Unknown command. Type /help for a list of available commands.');
			}
			break;
	}
}

function handle_private_message_authoring(sender_uid, message) {
	var command = message.split(' ')[0]
	
	switch (command) {
		case '/guidelines':
			send_private_message(sender_uid, 'Your trivia question should be in english and have answers which are either common knowledge or easily google-able. You should consider accepting multiple similar answers, particularly for things like date formats.');
			send_private_message(sender_uid, 'Answers are not case-sensitive. All \' and \" characters will be stripped.');
			break;
			
		case '/delete':
			var answers = authoring_answers[sender_uid];
			if (answers.length >= 1) {
				var s = ((answers.length - 1) != 1) ? 's' : '';
				send_private_message(sender_uid, '\'' + answers[answers.length - 1] + '\' has been deleted. ' + (answers.length - 1) + ' answer' + s + ' received.');
				answers.splice(answers.length - 1, 1);
			} else {
				send_private_message(sender_uid, 'No answer to delete.');
			}
			break;
			
		case '/cancel':
			send_private_message(sender_uid, 'You have left authoring mode and your question has been deleted.');
			user_states[sender_uid] = USER_STATE_DEFAULT;
			delete authoring_questions[sender_uid];
			delete authoring_answers[sender_uid];
			break;
			
		case '/done':
			if (user_states[sender_uid] === USER_STATE_AUTHORING_ANSWER) {
				if (authoring_answers[sender_uid].length >= 1) {
					send_private_message(sender_uid, 'Your question and answers have been received. Are you sure you want to submit them? (y/n)');
					user_states[sender_uid] = USER_STATE_CONFIRMING_QUESTION_SUBMISSION;
				} else {
					send_private_message(sender_uid, 'Your question must have at least 1 answer.');
				}
			} else {
				send_private_message(sender_uid, 'You must have a question written.');
			}
			break;
			
		default:
			if (command.charAt(0) === '/') {
				send_private_message(sender_uid, 'Unknown command.');
			} else if (user_states[sender_uid] === USER_STATE_AUTHORING_QUESTION) {
				handle_private_message_authoring_question(sender_uid, message);
			} else {
				handle_private_message_authoring_answer(sender_uid, message);
			}
	}
}

function handle_private_message_authoring_question(sender_uid, message) {
	send_private_message(sender_uid, 'Your question has been received. Please submit each accepted answer as a separate private message. Once you have entered all accepted answers type /done.');
	user_states[sender_uid] = USER_STATE_AUTHORING_ANSWER;
	authoring_questions[sender_uid] = message;
	authoring_answers[sender_uid] = new Array();
}

function handle_private_message_authoring_answer(sender_uid, message) {
	var answers = authoring_answers[sender_uid];
	answers[answers.length] = message;
	authoring_answers[sender_uid] = answers;
	var s = (answers.length > 1) ? 's' : '';
	send_private_message(sender_uid, answers.length + ' answer' + s + ' received.');
}

function handle_private_message_confirming_question_submission(sender_uid, message) {
	var command = message.split(' ')[0];
	
	switch (command) {
		case '/y':
		case '/yes':
		case '/done':
		case 'y':
		case 'yes':
		case 'done':
			send_private_message(sender_uid, 'Your question and answer(s) have been submitted. Thank you for your contribution!');
			user_states[sender_uid] = USER_STATE_DEFAULT;
			save_new_question(sender_uid);
			break;
		
		case '/n':
		case '/no':	
		case 'n':
		case 'no':
			send_private_message(sender_uid, 'Please submit each accepted answer as a separate private message. Once you have entered all accepted answers type /done. Your question currently has ' + authoring_answers[sender_uid].length + ' answers.');
			user_states[sender_uid] = USER_STATE_AUTHORING_ANSWER;
			break;
			
		default:
			send_private_message(sender_uid, 'Please respond with either yes or no.');
			break;
	}
	
}

function save_new_question(author_uid) {
	var answers_string = jsonify_string_array(authoring_answers[author_uid]);
	var clean_question = strip_bad_chars(authoring_questions[author_uid]);
	
	console.log(clean_question);
	console.log(answers_string);
	
	db.run('INSERT INTO Question(question, answers, reports, banned, author) VALUES(\'' + clean_question + '\', \'' + answers_string + '\', \'0\', \'0\', \'' + author_uid + '\')');
}

function login_then_run_bot() {
	
	var credentials = {hash: 		'',
						username: 	env.JDBOT_USERNAME,
	                    password: 	env.JDBOT_PASSWORD,
	                    code:     	''
	                   };
	
    login(credentials, function(err, cookie) {
        if (err) {
            console.log('ERROR:', err);
            return;
        }

        console.log('logged in; got cookie (secret - do not share!):');
        console.log(cookie);
        run_bot(cookie);
    });
}

function login(credentials, cb) {
    var jar = request.jar();

    req = {url: url, jar: jar, form: {}}

    if (credentials.hash) {
        if (credentials.username || credentials.password)
            return cb('either specify a hash or a username and password');
        jar.setCookie(request.cookie('hash=' + credentials.hash), url);
    }

    if (credentials.username) req.form.username = credentials.username;
    if (credentials.password) req.form.password = credentials.password;
    if (credentials.code)     req.form.code     = credentials.code;

    request.post(req, function(err, res, body) {
        if (err)
            return cb(err);

        // console.log(body);

        if (body.match(/Please enter your 6 digit google authentification number/))
            return cb('that account requires a correct 2FA code and hash to log in; 2FA codes can only be used once each');

        if (body.match(/Your account is set up to require a google authentification code for this action/))
            return cb('that account requires a 2FA code in addition to the username and password to log in');

        if (body.match(/Please enter your username/))
            return cb('that account requires a correct username and password, and possibly 2FA code; 2FA codes can only be used once each');

        var cookie = jar.getCookieString(url);

        if (!cookie.match(/hash=/))
            return cb('bad hash');

        return cb(null, cookie);
    });
}

var first_login = true;

function run_bot(cookie) {
    if (first_login) {
        init_readline();
        first_login = false;
    }

    var transport = 'websocket';
    // var transport = 'polling';

    var inits = 0;

    socket = require("socket.io-client")(url, {transports: [transport],
                                               extraHeaders: {
                                                   origin: url,
                                                   cookie: cookie
                                               }});

    socket.on('getver', function(key) {
        socket.emit('version', csrf, key, "jdbot:" + version);
    });

    socket.on('error', function(err) {
        console.log('caught error:', err);
		console.log('logging in again');
		login_then_run_bot();
    });

    socket.on('init', function(data) {
        uid = data.uid;
        if (!inits++) {
            // only do this stuff the first time we connect, not on reconnection

            // data is something like this:
            //
            // { api: 0,
            //   balance: '988.00000000',
            //   bankroll: '500215.49619137',
            //   bet: 0.5,
            //   bets: '2474',
            //   chance: 33,
            //   chat: 
            //    [ '{"user":"1243","name":"tammie","txt":"chat text 1"}',
            //      '1437445872584',
            //      '{"user":"1","name":"@derpy","txt":"etc."}',
            //      '1437452160715',
            //      '{"user":"1","name":"@derpy","txt":"etc.}',
            //      '1437452172081' ],
            //   csrf: 'f68wiCdKcdf6',
            //   edge: 1,
            //   fee: 0.001,
            //   ga: { active: false, failures: 0, last: '327860', ok: 1437123260013 },
            //   ignores: [],
            //   investment: 500181.4929641858,
            //   invest_pft: 181.49296418577433,
            //   login: '<p>You can log into the same account from a different computer or browser using <a href="/e47004523222720bdf835f741505f7acd9d7ead728893b65fd4ac59b07a33a20">this link</a>.<br/>Protect this secret link as it can be used to access your account balance.</p><p>If you prefer to use a more traditional and secure approach then<button id="setup_account">set up a username and password</button>.</p>',
            //   losses: '1305',
            //   luck: '96.28%',
            //   max_profit: '130001.07',
            //   name: 'dooglus',
            //   news: 'no news is set',
            //   nonce: '477',
            //   offsite: 25500000,
            //   percent: 99.99986921944092,
            //   profit: '-108.01000000',
            //   seed: '770695475991960934442523',
            //   settings: 
            //    { max_bet: 1,
            //      chat_watch_player: null,
            //      alert_words: 'dooglus',
            //      alert: 1,
            //      hilite: 1,
            //      pmding: 1,
            //      chat_min_risk: 1,
            //      chat_min_change: 1,
            //      styleme: 1 },
            //   shash: 'bf7feb2c04020f94262d9f01fa62fa4ce527e58f357372969ccb46c2ab85d3ed',
            //   stake_pft: 98.6989727076143,
            //   uid: '1',
            //   username: null,
            //   wagered: '2295.81000000',
            //   wins: '1169',
            //   stats: 
            //    { bets: '3315',
            //      wins: 1542,
            //      losses: 1773,
            //      luck: 3217.2707228742447,
            //      wagered: 2824.9700003,
            //      profit: -94.09198439,
            //      commission: 22.264911885550614,
            //      taken: 0,
            //      purse: 26000215.49619137,
            //      cold: 25500000,
            //      balance: 60827.14134891,
            //      sum1: 561042.63754028,
            //      sum2: 561064.90245217 },
            //   wdaddr: '' }

            csrf = data.csrf;
			update_balance(data.balance);
            max_profit = data.max_profit;
			my_uid = uid;
            console.log('### CONNECTED as (' + uid + ') <' + data.name + '> ###');
            // console.log('csrf is', csrf);
        } else {
            console.log('### RECONNECTED ###');
            // console.log('csrf was', csrf, 'and now is', data.csrf);
            csrf = data.csrf;
        }
    });

    socket.on('set_hash', function(hash) {
        console.log('INFO:', 'server requested that we reconnect...');
        socket.close();
        run_bot(cookie);
    });

    socket.on('chat', function(txt, date) {
        classify_and_handle_chat(txt, date);
    });
	
    socket.on('tip', function(sender_uid, sender_name, amount, r, i) {
		receive_tip(sender_uid, sender_name, amount, true)
    });

    socket.on('address', function(addr, img, confs) {
        console.log('DEPOSIT:', addr);
    });

    socket.on('invest_error', function(txt) {
        console.log('ERROR:', txt);
    });

    socket.on('divest_error', function(txt) {
        console.log('ERROR:', txt);
    });

    socket.on('jderror', function(txt) {
        console.log('ERROR:', txt);
    });

    socket.on('jdmsg', function(txt) {
        console.log('INFO:', txt);
    });

    socket.on('form_error', function(txt) {
        console.log('FORM ERROR:', txt);
    });

    socket.on('login_error', function(txt) {
        console.log('LOGIN ERROR:', txt);
    });

    socket.on('balance', function(data) {
		update_balance(data)
    });

    socket.on('disconnect', function() {
        console.log('### DISCONNECTED ###');
    });
}

//// other events the server reacts to:
//    client.on('disable_ga', function(csrf, code) {
//    client.on('divest', function(csrf, amount, code) {
//    client.on('done_edit_ga', function(csrf, code, flags) {
//    client.on('edit_ga', function(csrf) {
//    client.on('forget_max_warning', function(csrf) {
//    client.on('history', function(csrf, type) {
//    client.on('invest', function(csrf, amount, code) {
//    client.on('invest_box', function(csrf) {
//    client.on('random', function(csrf) {
//    client.on('repeat', function(csrf) {
//    client.on('roll', function(csrf, betid) {
//    client.on('seed', function(csrf, data, dismiss) {
//    client.on('setting', function(csrf, type, setting, value) {
//    client.on('setup_ga_code', function(csrf, code) {
//    client.on('user', function(csrf, data) {
