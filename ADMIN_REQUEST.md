# Admin Commands for MediaConvert Setup

## Quick Setup Commands

Run these commands to create the MediaConvert IAM role:

```bash
# 1. Create the role with trust policy
aws iam create-role \
  --role-name MediaConvertChimeRecordingsRole \
  --assume-role-policy-document file://mediaconvert-trust-policy.json

# 2. Attach S3 permissions to the role
aws iam put-role-policy \
  --role-name MediaConvertChimeRecordingsRole \
  --policy-name MediaConvertS3Access \
  --policy-document file://mediaconvert-s3-permissions.json

# 3. Get the role ARN (copy this to .env)
aws iam get-role \
  --role-name MediaConvertChimeRecordingsRole \
  --query 'Role.Arn' \
  --output text
```

## Expected Output

After running command #3, you should see:
```
arn:aws:iam::368289336576:role/MediaConvertChimeRecordingsRole
```

## Update .env File

Copy the ARN from step 3 and add it to `.env`:
```env
AWS_MEDIACONVERT_ROLE=arn:aws:iam::368289336576:role/MediaConvertChimeRecordingsRole
```

## Verification

Verify the role was created successfully:
```bash
aws iam get-role --role-name MediaConvertChimeRecordingsRole
```

List the role's policies:
```bash
aws iam list-role-policies --role-name MediaConvertChimeRecordingsRole
```

View the policy details:
```bash
aws iam get-role-policy \
  --role-name MediaConvertChimeRecordingsRole \
  --policy-name MediaConvertS3Access
```

## Troubleshooting

If you get an error about existing role:
```bash
# Delete existing role (if needed)
aws iam delete-role-policy \
  --role-name MediaConvertChimeRecordingsRole \
  --policy-name MediaConvertS3Access

aws iam delete-role --role-name MediaConvertChimeRecordingsRole

# Then retry the setup commands above
```

## Required IAM Permissions

The user running these commands needs:
- `iam:CreateRole`
- `iam:PutRolePolicy`
- `iam:GetRole`
- `iam:ListRolePolicies`
- `iam:GetRolePolicy`

## Files Required

Make sure these files exist in the project directory:
- `mediaconvert-trust-policy.json` ✓
- `mediaconvert-s3-permissions.json` ✓

## Next Steps After Setup

1. Copy the role ARN to `.env`
2. Restart the Next.js development server
3. Test recording functionality
4. Monitor MediaConvert jobs in AWS Console
