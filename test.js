const {check}=require('./rules.js');const a=require('assert');
a(check('Seller may change price at sole discretion. tokens to investors').score<50);
a.equal(check('governed by law; arbitration; terminate; force majeure; meter; limitation of liability; personal data').findings[0].level,'ok');
console.log('ok');
