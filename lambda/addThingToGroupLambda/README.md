# Notes

This lambda is related to the following configurations:

- IoT Core rule suitable for invoking it:

rule name: add_thing_to_group
rule: SELECT * FROM '$aws/events/thing/+/created'
action: Send a message to a Lambda function

- Things creation events enablement necessary for the trigger to work:

```bash
aws iot update-event-configurations \
  --event-configurations '{"THING":{"Enabled":true},"THING_GROUP":{"Enabled":true}}'
```