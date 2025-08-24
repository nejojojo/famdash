const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

/**
 * Token Management System for Google Fit OAuth tokens
 * Handles persistent storage, refresh, and fallback authentication
 */
class TokenManager {
    constructor() {
        this.tokenFilePath = path.join(__dirname, 'data', '.tokens.json');
        this.profilesPath = path.join(__dirname, 'data', 'profiles.json');
    }

    /**
     * Load tokens from secure storage (not tracked by git)
     */
    loadTokens() {
        try {
            if (fs.existsSync(this.tokenFilePath)) {
                const tokens = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
                return tokens;
            }
        } catch (error) {
            console.error('Error loading tokens:', error.message);
        }
        return {};
    }

    /**
     * Save tokens to secure storage
     */
    saveTokens(tokens) {
        try {
            fs.writeFileSync(this.tokenFilePath, JSON.stringify(tokens, null, 2));
            console.log('Tokens saved securely');
        } catch (error) {
            console.error('Error saving tokens:', error.message);
        }
    }

    /**
     * Get valid access token for a member (refresh if needed)
     */
    async getValidToken(memberId) {
        const tokens = this.loadTokens();
        const memberTokens = tokens[memberId];

        if (!memberTokens) {
            console.log(`No tokens found for ${memberId}`);
            return null;
        }

        // Check if token is expired (tokens expire after 1 hour)
        const tokenAge = Date.now() - memberTokens.created;
        const isExpired = tokenAge > (55 * 60 * 1000); // Refresh 5 minutes before expiry

        if (isExpired && memberTokens.refresh_token) {
            console.log(`Refreshing expired token for ${memberId}`);
            return await this.refreshToken(memberId);
        }

        return memberTokens.access_token;
    }

    /**
     * Refresh an expired access token using refresh token
     */
    async refreshToken(memberId) {
        try {
            const tokens = this.loadTokens();
            const memberTokens = tokens[memberId];

            if (!memberTokens || !memberTokens.refresh_token) {
                console.log(`No refresh token available for ${memberId}`);
                return null;
            }

            // Set up OAuth2 client with credentials
            const oauth2Client = this.getOAuth2Client();
            oauth2Client.setCredentials({
                refresh_token: memberTokens.refresh_token
            });

            // Refresh the token
            const { credentials } = await oauth2Client.refreshAccessToken();
            
            // Save new tokens
            tokens[memberId] = {
                ...memberTokens,
                access_token: credentials.access_token,
                created: Date.now()
            };
            
            this.saveTokens(tokens);
            console.log(`✅ Token refreshed successfully for ${memberId}`);
            
            return credentials.access_token;

        } catch (error) {
            console.error(`❌ Failed to refresh token for ${memberId}:`, error.message);
            return null;
        }
    }

    /**
     * Store new tokens after OAuth authentication
     */
    storeTokens(memberId, tokenData) {
        const tokens = this.loadTokens();
        
        tokens[memberId] = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            scope: tokenData.scope,
            token_type: tokenData.token_type,
            expiry_date: tokenData.expiry_date,
            created: Date.now()
        };

        this.saveTokens(tokens);
        console.log(`✅ New tokens stored for ${memberId}`);
    }

    /**
     * Update profiles.json with current token status (for API responses)
     */
    updateProfileTokenStatus(memberId, hasValidToken) {
        try {
            const profiles = JSON.parse(fs.readFileSync(this.profilesPath, 'utf8'));
            const memberIndex = profiles.members.findIndex(m => m.id === memberId);
            
            if (memberIndex !== -1) {
                // Store token status but not the actual token value
                profiles.members[memberIndex].googleFitToken = hasValidToken ? 'VALID_TOKEN' : null;
                profiles.members[memberIndex].tokenStatus = hasValidToken ? 'active' : 'expired';
                profiles.members[memberIndex].lastTokenCheck = new Date().toISOString();
                
                fs.writeFileSync(this.profilesPath, JSON.stringify(profiles, null, 2));
            }
        } catch (error) {
            console.error('Error updating profile token status:', error.message);
        }
    }

    /**
     * Get OAuth2 client configuration
     */
    getOAuth2Client() {
        const credentialsPath = path.join(__dirname, 'config', 'google-oauth2-credentials.json');
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        
        return new google.auth.OAuth2(
            credentials.web.client_id,
            credentials.web.client_secret,
            credentials.web.redirect_uris[0]
        );
    }

    /**
     * Check if member needs re-authentication
     */
    async needsReAuthentication(memberId) {
        const validToken = await this.getValidToken(memberId);
        return !validToken;
    }
}

module.exports = new TokenManager();