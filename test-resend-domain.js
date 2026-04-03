#!/usr/bin/env node

// Test script to verify Resend domain configuration
// This will test both hello@betwaggle.com and evan@betwaggle.com

const testEmail = async () => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY environment variable not set');
    process.exit(1);
  }

  // Test domains
  const testEmails = [
    {
      from: 'hello@betwaggle.com',
      description: 'hello@betwaggle.com domain'
    },
    {
      from: 'evan@betwaggle.com',
      description: 'evan@betwaggle.com domain'
    }
  ];

  for (const test of testEmails) {
    console.log(`\n🔍 Testing ${test.description}...`);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: test.from,
          to: ['evan.ratner@gmail.com'], // Test delivery to known working email
          subject: 'Domain verification test - Waggle',
          html: `<p>This is a domain verification test for <strong>${test.from}</strong></p>
                 <p>Sent at: ${new Date().toISOString()}</p>
                 <p>If you receive this, the domain is properly configured!</p>`
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`✅ ${test.description} - Success!`);
        console.log(`   Email ID: ${result.id}`);
      } else {
        console.log(`❌ ${test.description} - Failed!`);
        console.log(`   Error: ${result.message || 'Unknown error'}`);
        if (result.name === 'validation_error') {
          console.log('   This likely means the domain is not verified in Resend');
        }
      }
    } catch (error) {
      console.log(`❌ ${test.description} - Network error: ${error.message}`);
    }
  }

  console.log('\n🔍 Testing Resend API connection...');
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`
      }
    });

    const domains = await response.json();

    if (response.ok) {
      console.log('✅ Resend API connection working');
      console.log('📋 Configured domains:');
      domains.data.forEach(domain => {
        console.log(`   - ${domain.name} (${domain.status})`);
      });
    } else {
      console.log('❌ Failed to fetch domains:', domains);
    }
  } catch (error) {
    console.log('❌ Failed to connect to Resend API:', error.message);
  }
};

testEmail();