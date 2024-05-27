const express = require('express');
const forge = require('node-forge');

// echo -n | openssl s_client -connect museum-alert-event-grid.westeurope-1.ts.eventgrid.azure.net:443 | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > cert.pem

const app = express();
const port = 3000;

app.get('/generate-certificate', (req, res) => {
    // Generate a keypair and create an X.509v3 certificate
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [{
        name: 'commonName',
        value: 'MAS-EC357A188534'
    }, {
        name: 'countryName',
        value: 'IT'
    }, {
        shortName: 'ST',
        value: 'Italia'
    }, {
        name: 'localityName',
        value: 'Torino'
    }, {
        name: 'organizationName',
        value: 'Museum Alert'
    }, {
        shortName: 'OU',
        value: 'R&D'
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Self-sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert the certificate and private key to PEM format
    const certPem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Calculate the thumbprint (SHA-1 hash of the DER-encoded certificate)
    const certAsn1 = forge.pki.certificateToAsn1(cert);
    const certDer = forge.asn1.toDer(certAsn1).getBytes();
    const thumbprint = forge.md.sha1.create().update(certDer).digest().toHex();

    // Respond with the certificate, private key, and thumbprint
    res.json({
        certificate: certPem,
        privateKey: privateKeyPem,
        thumbprint: thumbprint
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
